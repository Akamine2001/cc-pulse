/**
 * Jules API レスポンステスト
 *
 * /v1/jobs APIのレスポンス形式を確認するスクリプト
 */

const JULES_API_URL = 'https://jules.googleapis.com/v1/jobs';

async function testJulesApi() {
  const apiKey = process.env.JULES_API_KEY;

  if (!apiKey) {
    console.error('❌ JULES_API_KEY environment variable is not set');
    process.exit(1);
  }

  console.log('🔑 API Key:', apiKey.substring(0, 10) + '...');
  console.log('');

  // テスト用のリクエストボディ
  const requestBody = {
    sourceContext: {
      githubRepoContext: {
        owner: 'Akamine2001',
        repo: 'cc-pulse',
        issueNumber: 22,  // 実在するIssue番号
        startingBranch: 'main',
      },
    },
    prompt: 'Test prompt to check API response format',
    automationMode: 'AUTO_CREATE_PR',
  };

  console.log('📤 Request URL:', JULES_API_URL);
  console.log('📤 Request Body:', JSON.stringify(requestBody, null, 2));
  console.log('');

  try {
    const response = await fetch(JULES_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('📥 Response Status:', response.status, response.statusText);
    console.log('📥 Response Headers:');
    response.headers.forEach((value, key) => {
      console.log(`   ${key}: ${value}`);
    });
    console.log('');

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('❌ API call failed');
      console.error('Error Body:', errorBody);
      console.error('');
      console.error('💡 Possible issues:');
      console.error('   - API endpoint might be incorrect');
      console.error('   - API key might be invalid or expired');
      console.error('   - GitHub issue might not be accessible');
      console.error('   - Repository might not be configured for Jules');
      process.exit(1);
    }

    const responseData = await response.json();

    console.log('✅ API call successful!');
    console.log('');
    console.log('📋 Full Response:');
    console.log(JSON.stringify(responseData, null, 2));
    console.log('');

    // レスポンスの構造を分析
    console.log('🔍 Response Analysis:');
    console.log('  - Keys:', Object.keys(responseData));

    if (responseData.url) {
      console.log('  - URL:', responseData.url);

      // URLからセッションID抽出を試みる
      const urlParts = responseData.url.split('/');
      console.log('  - URL parts:', urlParts);
    }

    if (responseData.sessionName) {
      console.log('  - Session Name:', responseData.sessionName);
    }

    if (responseData.name) {
      console.log('  - Name:', responseData.name);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

testJulesApi();
