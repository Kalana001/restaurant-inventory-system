const https = require('https');
https.get('https://restaurant-inventory-system-olive.vercel.app/assets/index-BYV2W5Tc.js', (res) => {
  let js = '';
  res.on('data', d => js += d);
  res.on('end', () => {
    console.log(js.substring(0, 500));
    const urlMatch = js.match(/https:\/\/[^\"]+\.supabase\.co/);
    console.log('Found Supabase URL?', urlMatch ? urlMatch[0] : 'None');
    const apiUrlMatch = js.match(/http[^\"]+api\/v1/);
    console.log('Found API URL?', apiUrlMatch ? apiUrlMatch[0] : 'None');
  });
});
