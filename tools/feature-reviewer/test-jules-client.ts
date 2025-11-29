/**
 * 修正版JulesApiClientの動作確認テスト
 */

import { JulesApiClient } from './core/jules-client';

async function testJulesClient() {
  const apiKey = process.env.JULES_API_KEY;

  if (!apiKey) {
    console.error('❌ JULES_API_KEY environment variable is not set');
    process.exit(1);
  }

  console.log('🧪 JulesApiClient Integration Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  const owner = 'Akamine2001';
  const repo = 'cc-pulse';
  const julesClient = new JulesApiClient(apiKey, owner, repo);

  try {
    // ====== Test 1: Session作成 ======
    console.log('📋 Test 1: Creating Jules session...');
    console.log('');

    const testPrompt = `# Integration Test Session

This is a test session created by the updated JulesApiClient.

## Task
Verify that the new implementation works correctly:
- Source retrieval
- Session creation
- Message sending

## Expected Result
All operations should complete successfully.
`;

    const issueNumber = 22;
    const subIssueNumber = 23;

    const issueTitle = 'Test Issue Title';

    const sessionResponse = await julesClient.startAutomatedImplementation(
      testPrompt,
      issueNumber,
      issueTitle,
      subIssueNumber
    );

    console.log('');
    console.log('✅ Session created successfully!');
    console.log('   Response:', JSON.stringify(sessionResponse, null, 2));
    console.log('');

    // ====== Test 2: メッセージ送信 ======
    console.log('📋 Test 2: Sending message to session...');
    console.log('');

    const testMessage = `Test message from updated JulesApiClient.

This confirms that the session accepts messages.`;

    await julesClient.sendMessageToSession(sessionResponse.url, testMessage);

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 All tests PASSED!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Summary:');
    console.log('  ✅ Source retrieval: SUCCESS');
    console.log('  ✅ Session creation: SUCCESS');
    console.log('  ✅ Message sending: SUCCESS');
    console.log('');
    console.log(`  📍 Session URL: ${sessionResponse.url}`);
    console.log(`  📍 Session Name: ${sessionResponse.name}`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ Test failed!');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

testJulesClient();
