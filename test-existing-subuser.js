// Quick test to use existing sub-user
const axios = require('axios');

async function testExistingSubUser() {
  try {
    // First, let's see if we can test the proxy with the existing sub-user credentials
    const testData = {
      username: 'spwu4x55h4',
      password: 'lvn4jRgbEmrhR1Q8~3'
    };

    // Test the proxy directly
    const proxyConfig = {
      host: 'gate.decodo.com',
      port: 7000,
      auth: {
        username: testData.username,
        password: testData.password
      },
      protocol: 'http'
    };

    console.log('Testing proxy with existing sub-user...');

    const response = await axios.get('https://ip.decodo.com/', {
      proxy: proxyConfig,
      timeout: 10000
    });

    console.log('Proxy test successful!');
    console.log('Response:', response.data);

  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testExistingSubUser();