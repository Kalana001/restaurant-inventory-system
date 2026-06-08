const https = require('https');
https.get('https://restaurant-inventory-system-olive.vercel.app/', (res) => {
  let html = '';
  res.on('data', d => html += d);
  res.on('end', () => {
    const match = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
    if (!match) return console.log('No JS bundle found in HTML', html.substring(0, 500));
    const jsUrl = 'https://restaurant-inventory-system-olive.vercel.app' + match[1];
    console.log('Fetching:', jsUrl);
    https.get(jsUrl, (jsRes) => {
      let js = '';
      jsRes.on('data', d => js += d);
      jsRes.on('end', () => {
        const urlMatch = js.match(/https:\/\/[^"]+\.supabase\.co/);
        console.log('Found Supabase URL?', urlMatch ? urlMatch[0] : 'None');
        const apiUrlMatch = js.match(/http[^"]+api\/v1/);
        console.log('Found API URL?', apiUrlMatch ? apiUrlMatch[0] : 'None');
        if(!urlMatch) {
            console.log('JS Snippet:', js.substring(0, 1000));
        }
      });
    });
  });
});
