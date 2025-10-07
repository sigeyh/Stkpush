const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Your M-Pesa credentials
const CONSUMER_KEY = '3nwtgRz334lrLeBJH6tvElqGBRRSD9hSIoEIymtF8nuNlnj3';
const CONSUMER_SECRET = 'jodS2CG9qn3Nfwy973BmnvhfCPGwxZGeERqurapgGnXpZCMBbFahTbI5NhQaeeIk';
const SHORTCODE = '174379'; // Sandbox shortcode
const PASSKEY = 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'; // Sandbox passkey

// Get access token
async function getAccessToken() {
    try {
        const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
        
        const response = await axios.get(
            'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${auth}`
                }
            }
        );
        
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting access token:', error.response?.data || error.message);
        throw error;
    }
}

// Generate password and timestamp
function generatePassword() {
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, -4);
    const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');
    return { password, timestamp };
}

// STK Push endpoint
app.post('/api/stk-push', async (req, res) => {
    try {
        const { phoneNumber, amount, accountReference, transactionDesc } = req.body;
        
        // Validate input
        if (!phoneNumber || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Phone number and amount are required'
            });
        }

        // Format phone number
        let formattedPhone = phoneNumber.replace(/\D/g, '');
        if (formattedPhone.startsWith('0')) {
            formattedPhone = '254' + formattedPhone.substring(1);
        } else if (formattedPhone.startsWith('+254')) {
            formattedPhone = formattedPhone.substring(1);
        } else if (formattedPhone.startsWith('254') === false) {
            formattedPhone = '254' + formattedPhone;
        }

        // Get access token
        const accessToken = await getAccessToken();
        const { password, timestamp } = generatePassword();

        // STK Push payload
        const payload = {
            BusinessShortCode: SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: 'CustomerPayBillOnline',
            Amount: amount,
            PartyA: formattedPhone,
            PartyB: SHORTCODE,
            PhoneNumber: formattedPhone,
            CallBackURL: `https://your-domain.com/callback`, // Replace with your callback URL
            AccountReference: accountReference || 'Payment',
            TransactionDesc: transactionDesc || 'Payment for goods/services'
        };

        // Make STK Push request
        const response = await axios.post(
            'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('STK Push Response:', response.data);

        res.json({
            success: true,
            message: 'STK Push initiated successfully',
            data: response.data,
            customerMessage: response.data.CustomerMessage
        });

    } catch (error) {
        console.error('STK Push Error:', error.response?.data || error.message);
        
        res.status(500).json({
            success: false,
            error: error.response?.data?.errorMessage || 'Failed to initiate payment',
            details: error.response?.data || error.message
        });
    }
});

// Callback endpoint (for M-Pesa to send payment results)
app.post('/api/callback', (req, res) => {
    console.log('Payment Callback Received:', JSON.stringify(req.body, null, 2));
    
    // Process the callback data
    const callbackData = req.body;
    
    // Extract payment information
    if (callbackData.Body && callbackData.Body.stkCallback) {
        const resultCode = callbackData.Body.stkCallback.ResultCode;
        const resultDesc = callbackData.Body.stkCallback.ResultDesc;
        
        if (resultCode === 0) {
            console.log('✅ Payment Successful');
            // Extract payment details and update your database
        } else {
            console.log('❌ Payment Failed:', resultDesc);
        }
    }
    
    // Always acknowledge receipt
    res.json({
        ResultCode: 0,
        ResultDesc: "Success"
    });
});

// Serve the HTML frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📱 M-Pesa STK Push ready for testing`);
});