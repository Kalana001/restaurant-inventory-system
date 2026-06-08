const https = require('https');
https.get('https://restaurant-inventory-system-olive.vercel.app/', (res) => {
  let html = '';
  res.on('data', d => html += d);
  res.on('end', () => {
    const match = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
    if (!match) return console.log('No JS bundle found in HTML');
    const jsUrl = 'https://restaurant-inventory-system-olive.vercel.app' + match[1];
    console.log('Fetching:', jsUrl);
    https.get(jsUrl, (jsRes) => {
      let js = '';
      jsRes.on('data', d => js += d);
      jsRes.on('end', () => {
        console.log('Has Supabase URL?', js.includes('smcnbhgbnxcfvayrfmht'));
        console.log('Has API URL?', js.includes('restaurant-inventory-system-b526.onrender.com'));
      });
    });
  });
});
