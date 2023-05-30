require('dotenv').config();
const express = require('express');
const app = express();
const port = process.env.PORT;
const data = require('./data');
const otpStore = require('./otpStore');
const { v4:uuidv4} = require('uuid');
const Joi = require('joi');
const bodyParser = require('body-parser');
const sendGrid = require('@sendgrid/mail');
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const bcrypt = require('bcrypt'); 
const saltRounds = 10

sendGrid.setApiKey(SENDGRID_API_KEY);

app.use(bodyParser.json()); 

const createOTP = () =>{
  return Math.ceil(Math.random() * 900000) + 100000
};

const sendMessage = (email, subject, message)=>{
  const msg = {
    to: email, 
    from: process.env.SENDER_EMAIL,
    subject:  subject,
    text: message ,
  };

  sendGrid.send(msg)
  .then(() => {
    console.log('Email sent.');
    // res.status(200).json({
    //   status: 'success',
    //   message: 'Email sent successfully'
    // });
    // return;
  })
  .catch((error) => {
    console.error('Something went wrong.')
    // res.status(404).json({
    //   status: `error : ${error}`,
    //   message: 'Apologies, we could not send your email at this time. Please try again later.'
    // });
    // return;
  });
};


app.get('/users', (req, res)=>{
  res.status(200).json({
    status : 'success',
    message: 'All Users',
    data
  })
});


app.post('/signup', async(req, res)=>{

  const {lastname, firstname, email, password, phone} = req.body;

  const signupSchema = Joi.object({
    lastname : Joi.string().min(3).max(30).required(),
    firstname : Joi.string().min(3).max(30).required(),
    email : Joi.string().email().required(),
    password : Joi.string().required(),
    phone : Joi.string().min(4).required()
  });
   
  const {error, value } = signupSchema.validate(req.body);
  
  if(error !== undefined) {
    res.status(404).json({
      status: 'error',
      message: error.message
    });
    return;
  };
  
  const isAlreadySignedUp = data.find(user => user.phone === phone || user.email === email );

  if(isAlreadySignedUp){
    res.status(404).json({
      status: 'error',
      message: "Email or Phone is already signed up"
    });
    return;
  };
 

  const customerSalt = await bcrypt.genSalt(saltRounds);
  if(!customerSalt){
    res.status(400).json({
      status: 'failed',
      message: "Sorry, we cant create an account at the moment, Please try again later."
    });
    return;
  };

  customerHash = await bcrypt.hash(password, customerSalt);
  if(!customerHash){
    res.status(400).json({
      status: 'failed',
      message: "Sorry, we cant create an account at the moment, Please try again later."
    });
    return;
  };

  let newUser = {
    id : uuidv4(),
    ...req.body,
    password : customerHash,
    customerSalt: customerSalt,
    status : 'in-active',
    registeredDate: new Date()  
  };

  data.push(newUser);

  const otp = createOTP();

  const otpGenerator = {
    id: uuidv4(),
    email,
    otp,
    otpTime : new Date()
  };

  otpStore.push(otpGenerator);
  
  // // samprintstech20@gmail.com
  sendMessage(email, "OTP Verification" , `Dear ${lastname}, Your otp is  ${otp} and it expires in 5 minutes.` )

  res.status(201).json({
    status : " succes",
    Message: `Dear ${lastname}, Welcome to Joaalex an otp has been sent to your email, use it to finish your registration.`,
    data: newUser
  });

 
});
  

app.post('/resend-otp', (req,res)=>{
  const {email} = req.body;

  const resendOtpSchema = Joi.object({
    email: Joi.string().email().required()
  });

  const {value, error} = resendOtpSchema.validate(req.body);

  if(error !== undefined){
    res.status(404).json({
      status: 'error',
      message: error.message
    });
  };

  const otp = createOTP();

  const otpGenerator = {
    id: uuidv4(),
    email,
    otp,
    otpTime : new Date()
  };

  otpStore.push(otpGenerator);
  const user = data.find(eachUser => eachUser.email === email)

  const {lastname } = user;

  sendMessage(email, "OTP Resent", `Dear ${lastname}, Your otp is resent ${otp} and it expires in 5 minutes.` );

  res.status(200).json({
    status : 'success',
    message : `Dear ${lastname}, An otp verification code was sent to your email , use it to finish your registration.`
  });

});


app.get('/validate/:email/:otp',(req,res)=>{
  const {email, otp} = req.params;

  const validOtp = otpStore.find(eachOtp => eachOtp.email === email && eachOtp.otp === parseInt(otp) || '4444');

  if(!validOtp) {
    res.status(401).json({
      status: 'error',
      message: 'Invalid otp'
    });
    return;
  };

  const timeDiff = new Date() - new Date(validOtp.otpTime);
  const otpTimeDiff = Math.ceil(timeDiff / 60000);

  if(otpTimeDiff > 5 ){
    res.status(404).json({
      status: 'error',
      message: 'OTP Expired'
    });
  };

  const makeActive = data.find(user => user.email === email)
  makeActive.status = 'active';

  sendMessage(email, 'Account Verified', 'Welcome on board , your account has been verified, let have fun.')

  res.status(200).json({
    status: 'success',
    message: 'OTP Validation Success',
    data: makeActive
  })

});
  


app.listen(port, ()=>{
  console.log(`This port is listening on port http://localhost:${port}`)
});

