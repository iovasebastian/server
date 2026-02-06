const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;

const authenticate = (req, res, next) => {


  const authHeader = req.headers.authorization;

  if (!authHeader) return res.status(401).send('No token provided');

  const token = authHeader.split(' ')[1];
  jwt.verify(token, secret, (err, decoded) => {
    if (err) return res.status(403).send('Invalid token');

    req.user = decoded;
    next();
  });
};

module.exports = authenticate;