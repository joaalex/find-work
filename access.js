require('dotenv').config();
const API_KEY = process.env.API_KEY;

const access = (key) => {

  if(!key || key !== API_KEY){
    return false;
  }
    return true;
};

module.exports = access;