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
const saltRounds = 10;
const axios = require('axios')
const access = require('./access');
const applicationStore = require('./applicationStore')


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
    console.log('Email sent successfully.');
    // res.status(200).json({
    //   status: 'success',
    //   message: 'Email sent successfully'
    // });
    // return;
  })
  .catch((error) => {
    console.error('Apologies, we could not send your email at this time. Please try again later.')
    // res.status(404).json({
    //   status: `error : ${error}`,
    //   message: 'Apologies, we could not send your email at this time. Please try again later.'
    // });
    // return;
  });
};


app.get('/users', (req, res)=>{

  const {apikey} = req.headers;

  if(!access(apikey)){
    res.status(401).json({
      status : false,
      message: "Unauthorized"
    });
    return;
  };

  res.status(200).json({
    status : true,
    message: 'All Users',
    data
  });

});


app.put('/admin', (req, res)=>{

  // const {apikey} = req.headers;

  // if(!access(apikey)){
  //   res.status(401).json({
  //     status : false,
  //     message: "Unauthorized"
  //   });
  //   return;
  // };
  
  const {jobId} = req.body; 
   
  const adminSchema = Joi.object({
    jobId: Joi.required()
  });

  const {value, error} = adminSchema.validate(req.body);

  if( error !== undefined){
    res.status(400).json({
      status : 'error',
      message: error.message
    });
  };

  const userJobInfo = applicationStore.find( user => user.jobId = jobId);

  if(!userJobInfo){
    res.status(404).json({
      status : 'error',
      message: 'User not found',
    });
  };

  userJobInfo.status = "Pending";

  sendMessage(userJobInfo.email, 'Application Status', `Dear ${userJobInfo.firstname} ${userJobInfo.lastname} , your job application id of ${jobId} is ${userJobInfo.status}`)


  res.status(200).json({
    status : 'success',
    message: `Your job application status is ${userJobInfo.status}`,
    data: userJobInfo
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
  console.log(otp)

  const otpGenerator = {
    id: uuidv4(),
    email,
    otp,
    otpTime : new Date()
  };

  otpStore.push(otpGenerator);
  
  // sendMessage(email, "OTP Verification" , `Dear ${lastname}, Your otp is  ${otp} and it expires in 5 minutes.` )

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
  console.log(otp);

  const otpGenerator = {
    id: uuidv4(),
    email,
    otp,
    otpTime : new Date()
  };

  otpStore.push(otpGenerator);
  const user = data.find(eachUser => eachUser.email === email)

  const {lastname } = user;

  // sendMessage(email, "OTP Resent", `Dear ${lastname}, Your otp is resent ${otp} and it expires in 5 minutes.` );

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
  const {firstname, lastname} = makeActive
  makeActive.status = 'active';

  // sendMessage(email, 'Account Verified', `Dear ${firstname} ${lastname}, Welcome on board , your account has been verified, let have fun.`)

  res.status(200).json({
    status: 'success',
    message: 'Account Verified Successfully',
    data: makeActive
  })

});

app.post('/login', async (req, res) => {

  const {emailOrPhone, password} = req.body;

  loginSchema = Joi.object({
    emailOrPhone : Joi.string().required(),
    password : Joi.string().required()
  });
  const {value, error} = loginSchema.validate(req.body);

  if(error !== undefined) {
    res.status(400).json({
      status : 'error',
      message : error.message
    })
    return; 
  };

  const user = data.find(user => user.email === emailOrPhone || user.phone === emailOrPhone);

  if(!user){
    res.status(404).json({
      status : 'error',
      message : 'Input a valid email or password.'
    });
  };

  const customerSalt = user.customerSalt;
  const access = await bcrypt.hash(password, customerSalt);

 

  if(user.status !== 'active'){
    res.status(404).json({
      status : 'error',
      message : 'Please go and verify your account.'
    });
  };


  if(user.email === emailOrPhone || user.phone === emailOrPhone && user.password === access){
    res.status(200).json({
      status : 'success',
      message : 'Login Successful.',
      data: user
    });
  };
  
})

app.get('/jobs', async (req, res)=>{

  const {apikey} = req.headers;
  
  if(!access(apikey)){
    res.status(401).json({
      status : false,
      message: 'Unauthorized Access'
    });
    return;
  }

  
  
  const length = req.query.length || 3;
  const company_name = req.query.company_name || '';
  const category = req.query.category || '';
  const search = req.query.search || '';

  let jobResponse = await axios({
    method: 'get',
    url: `${process.env.BASE_URL}/remote-jobs?limit=${length}&company_name=${company_name}&category=${category}&search=${search}`
  });


  res.status(200).json({
    status : 'success',
    massage: 'Available Job',
    counts : jobResponse.data.jobs.length,
    jobs: jobResponse.data.jobs
  });
});

app.get('/available-jobs', async (req, res) => {

  const findJobs = await axios({
    method : 'GET', 
    url : `${process.env.BASE_URL}/remote-jobs`,
  });

  const availableJobs = findJobs.data.jobs.map(job => job.category)
  res.status(200).json({
    status : 'success',
    message : 'Job category',
    data : availableJobs
  });
});

app.post('/job/applied', async (req,res) =>{

  const {jobId, lastname, firstname, address, email, yearsOfExperience} = req.body;

  appliedJobsSchema = Joi.object({
    jobId : Joi.required(),
    firstname : Joi.string().max(3).max(30).required(),
    lastname : Joi.string().max(3).max(30).required(),
    address : Joi.string().required(),
    email: Joi.string().email().required(),
    yearsOfExperience : Joi.string().required()
  });

  const {value, error} = appliedJobsSchema.validate(req.body);
  if( error !== undefined){
    res.status(404).json({
      status: 'error',
      message: error.message
    });
    return;
  };

  const userData = data.find(user => user.email === email)

  if(!userData){
    res.status(404).json({
      status: 'error',
      message: 'Information here is only available for active members, please sign up and try again.'
    });
    return;
  };

  const allJobs = await axios({
    method: 'get',
    url: `${process.env.BASE_URL}/remote-jobs`
    
  });
  // console.log(allJobs);

  const job = allJobs.data.jobs.find(joob => joob.id === jobId)
  console.log(job);

  if(!job || job.id !== jobId){
    res.status(404).json({
      status: 'error',
      message: 'Invalid job id provided.'
    });
    return;
  };

  const applicantData = {
    applicationId : uuidv4(),
    jobId,
    lastname,
    firstname,
    address,
    email,
    yearsOfExperience,
    status : 'submitted',
    date : new Date()
  }
  
  applicationStore.push(applicantData)

  // sendMessage(email, 'Application Status', `Dear ${firstname} ${lastname} , your job application id of ${jobId}  is ${applicantData.status} `)

  res.status(200).json({
    status: 'success',
    message: `Your application is successfully and the status is ${applicantData.status} .`,
    data: applicantData,
    job 
  });

});



app.listen(port, ()=>{
  console.log(`This port is listening on port http://localhost:${port}`)
});


// app.post('/job/applied', async (req,res) =>{

//   const {lastname, firstname, address, email, yearsOfExperience} = req.body;

//   appliedJobsSchema = Joi.object({
//     firstname : Joi.string().max(3).max(30).required(),
//     lastname : Joi.string().max(3).max(30).required(),
//     address : Joi.string().required(),
//     email: Joi.string().email().required(),
//     yearsOfExperience : Joi.string().required()
//   });

//   const {value, error} = appliedJobsSchema.validate(req.body);
//   if( error !== undefined){
//     res.status(404).json({
//       status: 'error',
//       message: error.message
//     });
//   };

//   const userData = data.find(user => user.email === email)

//   if(!userData){
//     res.status(404).json({
//       status: 'error',
//       message: 'Information here is only available for active members, please sign up and try again.'
//     })
//   }

//   const applicantData = {
//     jobId : uuidv4(),
//     lastname,
//     firstname,
//     address,
//     email,
//     yearsOfExperience,
//     status : 'submitted',
//     date : new Date()
//   }
  
//   applicationStore.push(applicantData)

//   sendMessage(email, 'Submission Progress', `Dear ${firstname} ${lastname} , your application is ${applicantData.status} `)

//   res.status(200).json({
//     status: 'success',
//     message: 'Your application has been successfully submitted.',
//     data: applicantData
//   });

// })

// {
//   fullname: "",
//   address: "",
//   email: ""
//   jobId: ""
//   yearsOfExperiece: "",
//   qualifications: "",
//   status: 

// }

