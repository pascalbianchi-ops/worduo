import express from 'express';

const app = express();

app.get('/__ping', (_req, res) => {
    res.type('text/plain').send('PING OK from min-server');
});

app.get('/__env', (_req, res) => {
    res.json({
        node: process.version,
        port: process.env.PORT,
        cwd: process.cwd()
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[MIN] listening on 0.0.0.0:${PORT}`);
});
