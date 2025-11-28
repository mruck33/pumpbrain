// /netlify/functions/analyzeTx.js
export const handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid JSON body.' })
    };
  }

  const { hash, chain = 'solana' } = body;
  if (!hash) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required field: hash' })
    };
  }

  try {
    let txContext = {};

    if (chain === 'solana') {
      // Use Helius RPC for Solana
      const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

      const txResponse = await fetch(heliusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [hash, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
        })
      });

      const txData = await txResponse.json();

      if (!txData.result) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Transaction not found.' })
        };
      }

      const tx = txData.result;
      const meta = tx.meta;
      const transaction = tx.transaction;

      // Extract basic info
      const blockTime = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null;
      const fee = meta?.fee || 0;
      const feeInSol = fee / 1e9;
      const feeUsd = feeInSol * 150; // Rough SOL price estimate

      // Extract token transfers
      const tokenTransfers = [];
      if (meta && meta.postTokenBalances && meta.preTokenBalances) {
        const postBalances = meta.postTokenBalances;
        const preBalances = meta.preTokenBalances;

        postBalances.forEach(postBalance => {
          const preBalance = preBalances.find(
            pb => pb.accountIndex === postBalance.accountIndex
          );
          if (preBalance) {
            const diff = postBalance.uiTokenAmount.uiAmount - preBalance.uiTokenAmount.uiAmount;
            if (diff !== 0) {
              tokenTransfers.push({
                token: postBalance.mint.substring(0, 8),
                amount: Math.abs(diff),
                direction: diff > 0 ? 'in' : 'out'
              });
            }
          }
        });
      }

      // Determine transaction type
      let decodedType = 'unknown';
      if (transaction.message.instructions) {
        const hasSwapInstruction = transaction.message.instructions.some(
          ix => ix.program === 'spl-token' || (ix.parsed && ix.parsed.type === 'transfer')
        );
        if (hasSwapInstruction && tokenTransfers.length >= 2) {
          decodedType = 'swap';
        } else if (hasSwapInstruction) {
          decodedType = 'transfer';
        }
      }

      txContext = {
        chain: 'solana',
        hash: hash,
        from: transaction.message.accountKeys?.[0]?.pubkey || 'unknown',
        to: transaction.message.accountKeys?.[1]?.pubkey || 'unknown',
        timestamp: blockTime,
        nativeAmountUsd: 0,
        feeUsd: parseFloat(feeUsd.toFixed(4)),
        tokenTransfers: tokenTransfers.slice(0, 5),
        decodedType: decodedType
      };

    } else {
      // Use Moralis for EVM chains
      const moralisBaseUrl = 'https://deep-index.moralis.io/api/v2.2';

      const txResponse = await fetch(
        `${moralisBaseUrl}/transaction/${hash}?chain=${chain}`,
        {
          headers: {
            'X-API-Key': process.env.MORALIS_API_KEY
          }
        }
      );

      if (!txResponse.ok) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Transaction not found.' })
        };
      }

      const txData = await txResponse.json();

      // Get token transfers
      const logsResponse = await fetch(
        `${moralisBaseUrl}/transaction/${hash}/logs?chain=${chain}`,
        {
          headers: {
            'X-API-Key': process.env.MORALIS_API_KEY
          }
        }
      );

      const logsData = await logsResponse.json();
      const tokenTransfers = [];

      if (logsData && Array.isArray(logsData)) {
        logsData.forEach(log => {
          if (log.decoded_event && log.decoded_event.label === 'Transfer') {
            tokenTransfers.push({
              token: log.address?.substring(0, 8) || 'unknown',
              amount: parseFloat(log.decoded_event.params?.[2]?.value || 0),
              direction: 'transfer'
            });
          }
        });
      }

      // Calculate fee
      const gasUsed = parseInt(txData.receipt_gas_used || 0);
      const gasPrice = parseInt(txData.gas_price || 0);
      const feeInWei = gasUsed * gasPrice;
      const feeInEth = feeInWei / 1e18;
      const feeUsd = feeInEth * 2000; // Rough ETH price estimate

      txContext = {
        chain: chain,
        hash: hash,
        from: txData.from_address || 'unknown',
        to: txData.to_address || 'unknown',
        timestamp: txData.block_timestamp || null,
        nativeAmountUsd: parseFloat(txData.value || 0) / 1e18 * 2000,
        feeUsd: parseFloat(feeUsd.toFixed(4)),
        tokenTransfers: tokenTransfers.slice(0, 5),
        decodedType: tokenTransfers.length > 1 ? 'swap' : 'transfer'
      };
    }

    // Call Claude API
    const prompt = `You are an on-chain transaction explainer for degen traders. Analyze the following transaction:

${JSON.stringify(txContext, null, 2)}

Return JSON only with:
{
  "summary": "",
  "actions": [],
  "feeUsd": 0,
  "riskNotes": []
}

summary: one or two sentences describing, in plain language, what happened and why it might matter.
actions: bullet-style list of concrete actions (e.g., "Swapped X for Y", "Bridged funds from A to B", "Approved an infinite allowance for token Z").
feeUsd: numeric best estimate of the fee in USD. If truly unknown, leave 0.
riskNotes: list of any potential risks or "watch out" items (e.g., "Large approval to unknown contract", "Thin liquidity", "New contract with no history").`;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.AI_API_KEY,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 800,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!claudeResponse.ok) {
      throw new Error('Claude API request failed');
    }

    const claudeData = await claudeResponse.json();
    const aiResponseText = claudeData.content[0].text;

    let analysisResult;
    try {
      analysisResult = JSON.parse(aiResponseText);
    } catch (parseErr) {
      // Fallback if JSON parsing fails
      analysisResult = {
        summary: 'Unable to fully decode this transaction, but it involved some on-chain activity.',
        actions: [],
        feeUsd: txContext.feeUsd || 0,
        riskNotes: [
          'AI output could not be parsed; treat this as unknown risk.',
          'Always verify the contract and transaction details directly on a block explorer.'
        ]
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(analysisResult)
    };

  } catch (error) {
    console.error('Error in analyzeTx:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error.' })
    };
  }
};
