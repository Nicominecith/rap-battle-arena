require('fs').writeFileSync('config.js','window.TWITCH_CLIENT_ID='+JSON.stringify(process.env.TWITCH_CLIENT_ID||'')+';\n');
