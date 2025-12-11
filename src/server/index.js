const express = require('express');
const cors = require('cors');
const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Railway!' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Server on', PORT));
