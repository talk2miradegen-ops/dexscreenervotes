const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (images, css, js) - Assuming they are in the root directory
// We specify index: false so it doesn't automatically serve index.html for '/'
app.use(express.static(__dirname, { index: false }));

app.get('/*', async (req, res) => {
    let ca = req.params[0] ? req.params[0].replace(/\/$/, '') : '';

    // Ignore common static file extensions just in case
    if (ca.match(/\.(js|css|png|jpg|jpeg|svg|ico|json)$/)) {
        return res.status(404).send('Not found');
    }

    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

    let title = 'DexScreener Votes • Elite Terminal';
    let ogTitle = 'Vote to Earn — DexScreener CORE';
    let ogDesc = '🗳 Vote and earn rewards from the community voting pool';
    let ogImage = '';
    let twImage = '';

    if (ca && ca.length > 10 && !ca.includes('/')) {
        try {
            // Native fetch is available in Node 18+
            const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(ca)}`);
            if (response.ok) {
                const data = await response.json();
                if (data && data.pairs && data.pairs.length > 0) {
                    const pairs = data.pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
                    const pair = pairs[0];
                    const token = pair.baseToken;
                    const tokenName = token.name || token.symbol || 'Unknown';
                    const tokenSymbol = token.symbol || '???';
                    const chainId = pair.chainId || 'unknown';

                    const chainSymMap = { solana: 'SOL', ethereum: 'ETH', bsc: 'BNB', polygon: 'MATIC', arbitrum: 'ARB', avalanche: 'AVAX', base: 'BASE', optimism: 'OP', fantom: 'FTM', cronos: 'CRO', sui: 'SUI', ton: 'TON' };
                    const chainRewardMap = { solana: 'SOL', ethereum: 'ETH', bsc: 'BNB', polygon: 'MATIC', arbitrum: 'ETH', avalanche: 'AVAX', base: 'ETH', optimism: 'ETH', fantom: 'FTM', cronos: 'CRO', sui: 'SUI', ton: 'TON' };
                    const chainSym = chainRewardMap[chainId] || chainSymMap[chainId] || chainId.toUpperCase();

                    const mcapRaw = pair.fdv || pair.marketCap || 0;
                    let mcapStr = '$' + Math.round(mcapRaw);
                    if (mcapRaw >= 1e9) mcapStr = '$' + (mcapRaw / 1e9).toFixed(1) + 'B';
                    else if (mcapRaw >= 1e6) mcapStr = '$' + (mcapRaw / 1e6).toFixed(1) + 'M';
                    else if (mcapRaw >= 1e3) mcapStr = '$' + (mcapRaw / 1e3).toFixed(1) + 'K';

                    title = `${tokenName} (${tokenSymbol}) — Vote to Earn ${chainSym}`;
                    ogTitle = title;
                    ogDesc = `🗳 Vote ${tokenSymbol} and earn ${chainSym} rewards from the community voting pool. Market Cap: ${mcapStr}`;

                    // Since the user requested the OG Image to be a full desktop view of the site instead of the token logo,
                    // we dynamically use an automatic screenshot API (Thum.io) to take a live picture of the webpage.
                    // We tell the API to wait 3 seconds to ensure the Dexscreener data has fully loaded before snapping!
                    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
                    const host = req.get('host');
                    const siteUrl = `${protocol}://${host}/${ca}`;

                    const screenshotUrl = `https://image.thum.io/get/width/1200/crop/630/wait/3/${siteUrl}`;

                    ogImage = screenshotUrl;
                    twImage = screenshotUrl;
                }
            }
        } catch (e) {
            console.error('API Error:', e);
        }
    }

    // Inject the exact CA we parsed on the backend straight into the JavaScript frontend
    // This bypasses any window.location.pathname issues on Vercel/Render!
    if (ca) {
        let injectionRegex = /function getCAFromURL\(\)\{[\s\S]*?return null;\s*\}/;
        let injectionCode = `function getCAFromURL() { return "${ca}"; }`;
        html = html.replace(injectionRegex, injectionCode);
    }


    // Replace the placeholders in HTML with the dynamic values
    html = html.replace(/<title>.*?<\/title>/g, `<title>${title}</title>`);
    html = html.replace(/<meta property="og:title".*?>/g, `<meta property="og:title" content="${ogTitle}" id="ogTitle">`);
    html = html.replace(/<meta property="og:description".*?>/g, `<meta property="og:description" content="${ogDesc}" id="ogDesc">`);
    html = html.replace(/<meta property="og:image".*?>/g, `<meta property="og:image" content="${ogImage}" id="ogImage">`);

    html = html.replace(/<meta name="twitter:title".*?>/g, `<meta name="twitter:title" content="${ogTitle}" id="twTitle">`);
    html = html.replace(/<meta name="twitter:description".*?>/g, `<meta name="twitter:description" content="${ogDesc}" id="twDesc">`);
    html = html.replace(/<meta name="twitter:image".*?>/g, `<meta name="twitter:image" content="${twImage}" id="twImage">`);

    res.send(html);
});

app.listen(PORT, () => {
    console.log(`Server running seamlessly! URL paths generate dynamic previews.`);
});
