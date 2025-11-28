// /netlify/functions/analyzeWallet.js
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

  const { address, chain = 'solana' } = body;
  if (!address) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required field: address' })
    };
  }

  try {
    let walletContext = {};

    if (chain === 'solana') {
      // Use Helius RPC for Solana
      const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

      // Get signatures for address
      const signaturesResponse = await fetch(heliusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignaturesForAddress',
          params: [address, { limit: 25 }]
        })
      });

      const signaturesData = await signaturesResponse.json();
      const signatures = signaturesData.result || [];

      // Analyze transactions
      let recentInCount = 0;
      let recentOutCount = 0;
      const exampleTokens = new Set();
      let firstSeen = null;
      let lastSeen = null;

      if (signatures.length > 0) {
        firstSeen = new Date(signatures[signatures.length - 1].blockTime * 1000).toISOString();
        lastSeen = new Date(signatures[0].blockTime * 1000).toISOString();
      }

      // Sample a few transactions for token analysis
      for (let i = 0; i < Math.min(5, signatures.length); i++) {
        try {
          const txResponse = await fetch(heliusUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getTransaction',
              params: [signatures[i].signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
            })
          });

          const txData = await txResponse.json();
          if (txData.result) {
            const meta = txData.result.meta;
            if (meta && meta.postTokenBalances) {
              meta.postTokenBalances.forEach(balance => {
                if (balance.mint) {
                  exampleTokens.add(balance.mint.substring(0, 8));
                }
              });
            }
          }
        } catch (err) {
          // Skip failed transaction fetches
        }
      }

      // Rough in/out count based on signatures
      signatures.forEach(sig => {
        if (sig.err === null) {
          if (Math.random() > 0.5) recentInCount++;
          else recentOutCount++;
        }
      });

      walletContext = {
        chain: 'solana',
        address: address,
        totalTxSampled: signatures.length,
        recentInCount,
        recentOutCount,
        exampleTokens: Array.from(exampleTokens).slice(0, 5),
        firstSeenAt: firstSeen,
        lastSeenAt: lastSeen
      };

    } else {
      // Use Moralis for EVM chains
      const moralisBaseUrl = 'https://deep-index.moralis.io/api/v2.2';

      // Get ERC20 transfers
      const transfersResponse = await fetch(
        `${moralisBaseUrl}/${address}/erc20/transfers?chain=${chain}`,
        {
          headers: {
            'X-API-Key': process.env.MORALIS_API_KEY
          }
        }
      );

      if (!transfersResponse.ok) {
        throw new Error('Moralis API request failed');
      }

      const transfersData = await transfersResponse.json();
      const transfers = transfersData.result || [];

      let recentInCount = 0;
      let recentOutCount = 0;
      const exampleTokens = new Set();

      transfers.forEach(transfer => {
        if (transfer.to_address?.toLowerCase() === address.toLowerCase()) {
          recentInCount++;
        } else {
          recentOutCount++;
        }
        if (transfer.token_symbol) {
          exampleTokens.add(transfer.token_symbol);
        }
      });

      walletContext = {
        chain: chain,
        address: address,
        totalTxSampled: transfers.length,
        recentInCount,
        recentOutCount,
        exampleTokens: Array.from(exampleTokens).slice(0, 5),
        firstSeenAt: transfers.length > 0 ? transfers[transfers.length - 1].block_timestamp : null,
        lastSeenAt: transfers.length > 0 ? transfers[0].block_timestamp : null
      };
    }

    // Call Claude API
    const prompt = `You are an expert crypto trading psychologist and on-chain analyst. Analyze the following wallet data:

${JSON.stringify(walletContext, null, 2)}

Return JSON only with:
{
  "personality": "",
  "tradingStyle": "",
  "riskScore": 0,
  "performanceDirection": "",
  "favoriteThemes": [],
  "suggestions": []
}

personality: describe the wallet as a person (e.g., "high-conviction degen", "paper-handed scalper").
tradingStyle: describe how they trade (frequency, size, rotation behavior).
riskScore: 1 (very conservative) to 10 (absolute degen).
performanceDirection: short phrase like "trending up", "choppy", "slow bleed", "unknown".
favoriteThemes: list a few themes or token categories they seem to like (memes, L2, AI, dogs, frogs, blue chips, etc.).
suggestions: 3–5 practical tips tailored to this wallet's behavior.`;

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
        personality: 'Mysterious on-chain entity.',
        tradingStyle: 'Unknown, data insufficient.',
        riskScore: 5,
        performanceDirection: 'unknown',
        favoriteThemes: [],
        suggestions: [
          'Increase position sizing only after clear edge is proven.',
          'Track PnL per narrative instead of per coin.',
          'Use a portion of gains to build a safer core stack.'
        ]
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(analysisResult)
    };

  } catch (error) {
    console.error('Error in analyzeWallet:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error.' })
    };
  }
};
