/**
 * 既存セッションへのメッセージ送信テスト
 */

const JULES_API_BASE = 'https://jules.googleapis.com/v1alpha';

async function testExistingSession() {
  const apiKey = process.env.JULES_API_KEY;

  if (!apiKey) {
    console.error('❌ JULES_API_KEY environment variable is not set');
    process.exit(1);
  }

  console.log('🧪 Testing message to existing session');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // 既存のセッション（手動で作成したもの）
  const sessionId = '11741333851424603667';
  const sessionName = `sessions/${sessionId}`;
  const endpoint = `${JULES_API_BASE}/${sessionName}:sendMessage`;

  console.log(`Session: ${sessionName}`);
  console.log(`Endpoint: ${endpoint}`);
  console.log('');

  const messageRequest = {
    prompt: `Test message at ${new Date().toISOString()}

This is a test to confirm the session accepts messages.`,
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify(messageRequest),
    });

    console.log(`Response status: ${response.status} ${response.statusText}`);
    console.log('');

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Error body:', errorBody);
      throw new Error(`Failed: ${response.status}`);
    }

    const responseBody = await response.text();
    console.log('✅ Message sent successfully!');
    if (responseBody) {
      console.log('Response:', responseBody);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testExistingSession();
