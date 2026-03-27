/**
 * Test ACF fields - check if ACF to REST API is working
 * Uses native fetch (Node 18+)
 */

const WORDPRESS_URL = 'https://rocomadrid.com';
const AUTH = 'ramiro:nYk6 8Kwu Xkms GSXP gbod FV2b';

function getAuthHeader() {
    const credentials = Buffer.from(AUTH).toString('base64');
    return {
        'Authorization': `Basic ${credentials}`
    };
}

async function testACF() {
    console.log('Testing ACF REST API configuration...\n');
    console.log(`URL: ${WORDPRESS_URL}`);

    // Test 1: Check custom blokes endpoint
    console.log('\n1. Checking custom blokes/v1/all endpoint...');
    try {
        const blokesResponse = await fetch(`${WORDPRESS_URL}/wp-json/blokes/v1/all`);

        if (blokesResponse.ok) {
            const blokes = await blokesResponse.json();
            console.log(`   ✓ Found ${blokes.length} blokes`);

            if (blokes.length > 0) {
                const firstBloke = blokes[0];
                console.log(`   First bloke: "${firstBloke.title}"`);
                console.log(`   ACF fields:`, JSON.stringify(firstBloke.acf, null, 2));
            }
        } else {
            console.log(`   ⚠ Error: HTTP ${blokesResponse.status}`);
            const text = await blokesResponse.text();
            console.log('   Response:', text.substring(0, 200));
        }
    } catch (error) {
        console.log('   ❌ Error:', error.message);
    }

    // Test 2: Check ACF for blokes post type
    console.log('\n2. Checking ACF for blokes post type...');
    try {
        const acfBlokesResponse = await fetch(`${WORDPRESS_URL}/wp-json/acf/v3/blokes?per_page=20`, {
            headers: getAuthHeader()
        });

        if (acfBlokesResponse.ok) {
            const blokes = await acfBlokesResponse.json();
            console.log(`   ✓ Found ${blokes.length} blokes with ACF`);

            if (blokes.length > 0) {
                const first = blokes[0];
                console.log(`\n   First bloke: "${first.title?.rendered || first.title}"`);
                console.log(`   ACF data:`, JSON.stringify(first.acf, null, 2));
            }
        } else {
            console.log(`   ⚠ Error: HTTP ${acfBlokesResponse.status}`);
            const text = await acfBlokesResponse.text();
            console.log('   Response:', text.substring(0, 300));
        }
    } catch (error) {
        console.log('   ❌ Error:', error.message);
    }

    // Test 3: List all ACF field groups
    console.log('\n3. Checking ACF field groups...');
    try {
        const fieldGroupsResponse = await fetch(`${WORDPRESS_URL}/wp-json/acf/v3/field_groups`, {
            headers: getAuthHeader()
        });

        if (fieldGroupsResponse.ok) {
            const fieldGroups = await fieldGroupsResponse.json();
            console.log(`   ✓ Found ${fieldGroups.length} ACF field groups`);

            for (const group of fieldGroups) {
                console.log(`\n   Field group: "${group.title}" (ID: ${group.ID})`);
                console.log(`   Key: ${group.key}`);
                // Show fields in this group
                if (group.fields && group.fields.length > 0) {
                    console.log(`   Fields:`);
                    group.fields.forEach(f => {
                        console.log(`     - ${f.name} (${f.type}) - show_in_rest: ${f.show_in_rest}`);
                    });
                }
            }
        } else {
            console.log(`   ⚠ Field groups error: HTTP ${fieldGroupsResponse.status}`);
        }
    } catch (error) {
        console.log('   ❌ Error:', error.message);
    }

    console.log('\n=== DIAGNOSIS ===');
    console.log('If ACF fields are not showing:');
    console.log('1. Go to ACF > Field Groups');
    console.log('2. Edit each field group');
    console.log('3. Enable "Show in REST API" setting');
    console.log('4. Save the field group');
}

testACF().catch(console.error);