// This file is required for multipart/form-data parsing for alt payment endpoints
const multer = require('multer');
const upload = multer();

module.exports = upload;
