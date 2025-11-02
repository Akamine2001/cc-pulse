/**
 * Jules API 完全統合テスト
 *
 * Source取得 → Session作成 → メッセージ送信の完全なフロー
 */

const JULES_API_BASE = 'https://jules.googleapis.com/v1alpha';

async function testJulesComplete() {
  const apiKey = process.env.JULES_API_KEY;

  if (!apiKey) {
    console.error('❌ JULES_API_KEY environment variable is not set');
    process.exit(1);
  }

  console.log('🧪 Jules API Complete Integration Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  try {
    // ====== Step 1: Sourceリスト取得 ======
    console.log('📋 Step 1: Fetching available sources...');
    console.log('');

    const sourcesResponse = await fetch(`${JULES_API_BASE}/sources`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
      },
    });

    if (!sourcesResponse.ok) {
      const errorBody = await sourcesResponse.text();
      throw new Error(`Failed to fetch sources: ${sourcesResponse.status} - ${errorBody}`);
    }

    const sourcesData = await sourcesResponse.json();
    console.log('✅ Sources retrieved');
    console.log('Available sources:', JSON.stringify(sourcesData, null, 2));
    console.log('');

    // cc-pulseリポジトリのSourceを検索
    const ccPulseSource = sourcesData.sources?.find((s: any) =>
      s.githubRepo?.owner === 'Akamine2001' &&
      s.githubRepo?.repo === 'cc-pulse'
    );

    if (!ccPulseSource) {
      console.error('❌ Source for Akamine2001/cc-pulse not found');
      console.log('');
      console.log('💡 Please register the repository in Jules Web UI first:');
      console.log('   https://jules.google.com');
      process.exit(1);
    }

    console.log('✅ Found cc-pulse source:');
    console.log(`   Name: ${ccPulseSource.name}`);
    console.log(`   ID: ${ccPulseSource.id}`);
    console.log('');

    // ====== Step 2: Session作成 ======
    console.log('📋 Step 2: Creating Jules session...');
    console.log('');

    const sessionRequest = {
      prompt: `# Test Session for API Integration

This is a test session created by cc-pulse automated testing.

## Task
Please analyze this test prompt and confirm receipt.

## Expected Behavior
- Session should be created successfully
- We should be able to send messages to this session
`,
      sourceContext: {
        source: ccPulseSource.name,  // sources/{sourceId}
        githubRepoContext: {
          startingBranch: 'main',
        },
      },
      automationMode: 'AUTO_CREATE_PR',
    };

    console.log('Request body:', JSON.stringify(sessionRequest, null, 2));
    console.log('');

    const sessionResponse = await fetch(`${JULES_API_BASE}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify(sessionRequest),
    });

    if (!sessionResponse.ok) {
      const errorBody = await sessionResponse.text();
      throw new Error(`Failed to create session: ${sessionResponse.status} - ${errorBody}`);
    }

    const sessionData = await sessionResponse.json();
    console.log('✅ Session created!');
    console.log('Session data:', JSON.stringify(sessionData, null, 2));
    console.log('');
    console.log(`   URL: ${sessionData.url}`);
    console.log(`   ID: ${sessionData.id}`);
    console.log('');

    // ====== Step 3: メッセージ送信 ======
    console.log('📋 Step 3: Sending message to session...');
    console.log('');

    const messageRequest = {
      prompt: `@jules This is a test message from cc-pulse API integration test.

Please confirm that you received this message.`,
    };

    const sessionName = sessionData.name;  // sessions/{sessionId}
    const messageEndpoint = `${JULES_API_BASE}/${sessionName}:sendMessage`;

    console.log(`Sending to: ${messageEndpoint}`);
    console.log('');

    const messageResponse = await fetch(
      messageEndpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
        },
        body: JSON.stringify(messageRequest),
      }
    );

    if (!messageResponse.ok) {
      const errorBody = await messageResponse.text();
      throw new Error(`Failed to send message: ${messageResponse.status} - ${errorBody}`);
    }

    console.log('✅ Message sent successfully!');
    console.log('');

    // ====== Summary ======
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 Complete integration test PASSED!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Summary:');
    console.log(`  ✅ Source retrieval: SUCCESS`);
    console.log(`  ✅ Session creation: SUCCESS`);
    console.log(`  ✅ Message sending: SUCCESS`);
    console.log('');
    console.log(`  📍 Source: ${ccPulseSource.name}`);
    console.log(`  📍 Session URL: ${sessionData.url}`);
    console.log('');
    console.log('💡 Next steps:');
    console.log('  1. Check the session in Jules Web UI');
    console.log('  2. Verify that Jules received the message');
    console.log('  3. Update jules-client.ts with the correct flow');

  } catch (error) {
    console.error('');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ Integration test failed!');
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

testJulesComplete();
