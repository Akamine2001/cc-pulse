/**
 * Jules sendMessage API テスト
 *
 * セッションにメッセージを送信するAPIのテスト
 */

const JULES_API_BASE = 'https://jules.googleapis.com';

async function testSendMessage() {
  const apiKey = process.env.JULES_API_KEY;

  if (!apiKey) {
    console.error('❌ JULES_API_KEY environment variable is not set');
    process.exit(1);
  }

  console.log('🔑 API Key:', apiKey.substring(0, 10) + '...');
  console.log('');

  // セッションURL: https://jules.google.com/task/11741333851424603667
  const taskId = '11741333851424603667';

  // 試すべきセッション名の形式
  const sessionFormats = [
    `sessions/${taskId}`,
    `tasks/${taskId}`,
  ];

  for (const sessionName of sessionFormats) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🧪 Testing with session name: ${sessionName}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    const endpoint = `${JULES_API_BASE}/v1alpha/${sessionName}:sendMessage`;
    const requestBody = {
      prompt: 'Test message from cc-pulse API test script',
    };

    console.log('📤 Request URL:', endpoint);
    console.log('📤 Request Body:', JSON.stringify(requestBody, null, 2));
    console.log('');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      console.log('📥 Response Status:', response.status, response.statusText);
      console.log('📥 Response Headers:');
      response.headers.forEach((value, key) => {
        console.log(`   ${key}: ${value}`);
      });
      console.log('');

      const responseText = await response.text();

      if (!response.ok) {
        console.error('❌ API call failed');
        if (responseText) {
          console.error('Error Body:', responseText);
        } else {
          console.error('Error Body: (empty)');
        }
        console.log('');
      } else {
        console.log('✅ API call successful!');

        if (responseText) {
          console.log('📋 Response Body:');
          try {
            const jsonResponse = JSON.parse(responseText);
            console.log(JSON.stringify(jsonResponse, null, 2));
          } catch {
            console.log(responseText);
          }
        } else {
          console.log('📋 Response Body: (empty - expected for sendMessage)');
        }
        console.log('');

        console.log('🎉 SUCCESS! This session format works!');
        console.log(`   Correct session name format: ${sessionName}`);
        console.log('');

        // 成功したのでテスト終了
        process.exit(0);
      }

    } catch (error) {
      console.error('❌ Error:', error);
      if (error instanceof Error) {
        console.error('   Message:', error.message);
      }
      console.log('');
    }
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('❌ All session formats failed');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  process.exit(1);
}

testSendMessage();
