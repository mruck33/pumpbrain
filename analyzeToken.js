// /netlify/functions/analyzeToken.js
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

  const { address } = body;
  if (!address) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required field: address' })
    };
  }

  try {
    // Fetch token data from Dexscreener
    const dexscreenerResponse = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${address}`
    );

    if (!dexscreenerResponse.ok) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Token not found on Dexscreener.' })
      };
    }

    const dexData = await dexscreenerResponse.json();

    if (!dexData.pairs || dexData.pairs.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Token not found on Dexscreener.' })
      };
    }

    const pair = dexData.pairs[0];

    // Build token context
    const tokenContext = {
      tokenAddress: address,
      chain: pair.chainId || null,
      dex: pair.dexId || null,
      pairCreatedAt: pair.pairCreatedAt || null,
      priceUsd: pair.priceUsd || null,
      liquidityUsd: pair.liquidity?.usd || null,
      volume24hUsd: pair.volume?.h24 || null,
      buys24h: pair.txns?.h24?.buys || null,
      sells24h: pair.txns?.h24?.sells || null,
      fdv: pair.fdv || null,
      urls: pair.urls || {},
      baseToken: pair.baseToken || {},
      quoteToken: pair.quoteToken || {}
    };

    // Call Claude API
    const prompt = `You are an expert crypto meme coin analyst. Analyze the following token data:

${JSON.stringify(tokenContext, null, 2)}

Return JSON only with:
{
  "summary": "",
  "riskScore": 0,
  "strengthScore": 0,
  "memeVibe": "",
  "pros": [],
  "cons": [],
  "degenComment": "",
  "jupiterUrl": ""
}

Risk score: 1 (very safe) to 10 (super risky)
Strength score: 1 (weak) to 10 (strong momentum)
Meme vibe: short description of the "energy" behind the token.
Pros: list of positive factors.
Cons: list of concerns or red flags.
Degen comment: entertaining, meme-friendly one-liner in degen culture style.

Jupiter URL must be formatted exactly as:
"https://jup.ag/swap/So11111111111111111111111111111111111111112-${address}"`;

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
        summary: 'AI analysis failed to parse.',
        riskScore: 7,
        strengthScore: 5,
        memeVibe: 'Unknown',
        pros: [],
        cons: [],
        degenComment: 'AI fumbled the JSON but PumpBrain stays cooking.',
        jupiterUrl: `https://jup.ag/swap/So11111111111111111111111111111111111111112-${address}`
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(analysisResult)
    };

  } catch (error) {
    console.error('Error in analyzeToken:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error.' })
    };
  }
};
