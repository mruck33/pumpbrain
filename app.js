// ========================================
// DOM ELEMENT SELECTORS
// ========================================
const $ = (id) => document.getElementById(id);

// Logo
const logo = $('logo');

// Hero CTAs
const heroAnalyzeBtn = $('hero-analyze-btn');
const heroWalletBtn = $('hero-wallet-btn');

// Token Analyzer
const tokenInput = $('token-input');
const analyzeTokenBtn = $('analyze-token-btn');
const tokenResult = $('token-result');

// Wallet Analyzer
const walletInput = $('wallet-input');
const analyzeWalletBtn = $('analyze-wallet-btn');
const walletResult = $('wallet-result');

// Transaction Analyzer
const txInput = $('tx-input');
const analyzeTxBtn = $('analyze-tx-btn');
const txResult = $('tx-result');

// ========================================
// LOGO CLICK HANDLER
// ========================================
logo.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ========================================
// HERO CTA HANDLERS
// ========================================
heroAnalyzeBtn.addEventListener('click', () => {
  // Scroll to token analyzer card
  const tokenCard = document.getElementById('token-analyzer-card');
  if (tokenCard) {
    tokenCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

heroWalletBtn.addEventListener('click', () => {
  // Scroll to wallet & tx section
  const walletTxSection = document.getElementById('wallet-tx-section');
  if (walletTxSection) {
    walletTxSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// ========================================
// TOKEN ANALYZER
// ========================================
analyzeTokenBtn.addEventListener('click', async () => {
  const address = tokenInput.value.trim();

  if (!address) {
    tokenResult.innerHTML = '<p style="color: var(--neon-pink);">⚠️ Please enter a token address or URL.</p>';
    return;
  }

  // Show loading state
  tokenResult.classList.add('loading');
  tokenResult.innerHTML = 'Analyzing…';

  try {
    const response = await fetch('/.netlify/functions/analyzeToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address })
    });

    if (!response.ok) {
      throw new Error('Analysis failed');
    }

    const data = await response.json();
    renderTokenResult(data);
  } catch (error) {
    tokenResult.classList.remove('loading');
    tokenResult.innerHTML = '<p style="color: var(--neon-pink);">⚠️ Something went wrong. Please try again later.</p>';
    console.error('Token analysis error:', error);
  }
});

function renderTokenResult(data) {
  tokenResult.classList.remove('loading');

  let html = `
    <h4>Analysis Results</h4>
    <p><strong>Summary:</strong> ${data.summary || 'N/A'}</p>
    <p>
      <span class="score-badge">Risk: ${data.riskScore !== undefined ? data.riskScore : 'N/A'}</span>
      <span class="score-badge">Strength: ${data.strengthScore !== undefined ? data.strengthScore : 'N/A'}</span>
    </p>
    <p><strong>Meme Vibe:</strong> ${data.memeVibe || 'N/A'}</p>
  `;

  if (data.pros && data.pros.length > 0) {
    html += '<p><strong>Pros:</strong></p><ul>';
    data.pros.forEach(pro => {
      html += `<li>${pro}</li>`;
    });
    html += '</ul>';
  }

  if (data.cons && data.cons.length > 0) {
    html += '<p><strong>Cons:</strong></p><ul>';
    data.cons.forEach(con => {
      html += `<li>${con}</li>`;
    });
    html += '</ul>';
  }

  if (data.degenComment) {
    html += `<p><strong>Degen Comment:</strong> ${data.degenComment}</p>`;
  }

  if (data.jupiterUrl) {
    html += `<a href="${data.jupiterUrl}" target="_blank" rel="noopener noreferrer" class="jupiter-link">Buy on Jupiter</a>`;
  }

  tokenResult.innerHTML = html;
}

// ========================================
// WALLET ANALYZER
// ========================================
analyzeWalletBtn.addEventListener('click', async () => {
  const address = walletInput.value.trim();

  if (!address) {
    walletResult.innerHTML = '<p style="color: var(--neon-pink);">⚠️ Please enter a wallet address.</p>';
    return;
  }

  walletResult.classList.add('loading');
  walletResult.innerHTML = 'Analyzing…';

  try {
    const response = await fetch('/.netlify/functions/analyzeWallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address })
    });

    if (!response.ok) {
      throw new Error('Analysis failed');
    }

    const data = await response.json();
    renderWalletResult(data);
  } catch (error) {
    walletResult.classList.remove('loading');
    walletResult.innerHTML = '<p style="color: var(--neon-pink);">⚠️ Something went wrong. Please try again later.</p>';
    console.error('Wallet analysis error:', error);
  }
});

function renderWalletResult(data) {
  walletResult.classList.remove('loading');

  let html = `
    <h4>Wallet Profile</h4>
    <p><strong>Personality:</strong> ${data.personality || 'N/A'}</p>
    <p><strong>Trading Style:</strong> ${data.tradingStyle || 'N/A'}</p>
    <p><span class="score-badge">Risk Score: ${data.riskScore !== undefined ? data.riskScore : 'N/A'}</span></p>
    <p><strong>Performance:</strong> ${data.performanceDirection || 'N/A'}</p>
  `;

  if (data.favoriteThemes && data.favoriteThemes.length > 0) {
    html += '<p><strong>Favorite Themes:</strong></p><p>';
    data.favoriteThemes.forEach(theme => {
      html += `<span class="theme-badge">${theme}</span>`;
    });
    html += '</p>';
  }

  if (data.suggestions && data.suggestions.length > 0) {
    html += '<p><strong>Suggestions:</strong></p><ul>';
    data.suggestions.forEach(suggestion => {
      html += `<li>${suggestion}</li>`;
    });
    html += '</ul>';
  }

  walletResult.innerHTML = html;
}

// ========================================
// TRANSACTION ANALYZER
// ========================================
analyzeTxBtn.addEventListener('click', async () => {
  const hash = txInput.value.trim();

  if (!hash) {
    txResult.innerHTML = '<p style="color: var(--neon-pink);">⚠️ Please enter a transaction hash.</p>';
    return;
  }

  txResult.classList.add('loading');
  txResult.innerHTML = 'Analyzing…';

  try {
    const response = await fetch('/.netlify/functions/analyzeTx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hash })
    });

    if (!response.ok) {
      throw new Error('Analysis failed');
    }

    const data = await response.json();
    renderTxResult(data);
  } catch (error) {
    txResult.classList.remove('loading');
    txResult.innerHTML = '<p style="color: var(--neon-pink);">⚠️ Something went wrong. Please try again later.</p>';
    console.error('Transaction analysis error:', error);
  }
});

function renderTxResult(data) {
  txResult.classList.remove('loading');

  let html = `
    <h4>Transaction Breakdown</h4>
    <p><strong>Summary:</strong> ${data.summary || 'N/A'}</p>
  `;

  if (data.actions && data.actions.length > 0) {
    html += '<p><strong>Actions:</strong></p><ul>';
    data.actions.forEach(action => {
      html += `<li>${action}</li>`;
    });
    html += '</ul>';
  }

  if (data.feeUsd !== undefined && data.feeUsd !== null) {
    html += `<p><strong>Fee:</strong> $${data.feeUsd.toFixed(4)}</p>`;
  }

  if (data.riskNotes && data.riskNotes.length > 0) {
    html += '<p><strong>Risk Notes:</strong></p><ul>';
    data.riskNotes.forEach(note => {
      html += `<li>${note}</li>`;
    });
    html += '</ul>';
  }

  txResult.innerHTML = html;
}

// ========================================
// INITIALIZATION
// ========================================
console.log('🧠 PumpBrain initialized successfully');
