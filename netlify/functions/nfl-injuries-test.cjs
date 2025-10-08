// Simple test function to verify handler export works
const { getStore } = require('@netlify/blobs');

exports.handler = async () => {
  console.log('🏥 Simple injury test starting...');
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      success: true,
      message: 'Handler export is working!',
      timestamp: new Date().toISOString(),
      test: 'If you see this, the function deployed correctly'
    })
  };
};
