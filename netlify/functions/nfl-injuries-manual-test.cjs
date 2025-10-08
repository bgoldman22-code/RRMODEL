// Simple manual injury data for testing
// This bypasses all API calls and returns known test data

exports.handler = async () => {
  console.log('🏥 Manual injury test data endpoint');
  
  const testInjuries = {
    success: true,
    version: 'manual_test_v1',
    asOf: new Date().toISOString(),
    teams: {
      KC: {
        teamName: 'Kansas City Chiefs',
        teamCode: 'KC',
        injuries: [
          {
            playerName: 'Patrick Mahomes',
            position: 'QB',
            status: 'questionable',
            depthOrder: 'QB1',
            description: 'Ankle',
            impact: {
              positionCategory: 'QB',
              finalPoints: 4.2,
              spreadImpact: 3.8,
              totalImpact: 2.1,
              isSignificant: true
            },
            source: 'MANUAL_TEST'
          }
        ],
        significantInjuries: 1,
        totalImpact: {
          spread: 3.8,
          total: 2.1
        }
      },
      CIN: {
        teamName: 'Cincinnati Bengals',
        teamCode: 'CIN',
        injuries: [
          {
            playerName: 'Joe Burrow',
            position: 'QB',
            status: 'out',
            depthOrder: 'QB1',
            description: 'Wrist',
            impact: {
              positionCategory: 'QB',
              finalPoints: 6.5,
              spreadImpact: 5.2,
              totalImpact: 3.8,
              isSignificant: true
            },
            source: 'MANUAL_TEST'
          },
          {
            playerName: 'Tee Higgins',
            position: 'WR',
            status: 'questionable',
            depthOrder: 'WR1',
            description: 'Hamstring',
            impact: {
              positionCategory: 'WR',
              finalPoints: 2.1,
              spreadImpact: 1.5,
              totalImpact: 1.2,
              isSignificant: true
            },
            source: 'MANUAL_TEST'
          }
        ],
        significantInjuries: 2,
        totalImpact: {
          spread: 6.7,
          total: 5.0
        }
      }
    },
    summary: {
      totalInjuriesFound: 3,
      significantInjuries: 3,
      replacementAdjustedCount: 3,
      criticalAlerts: [
        'CIN: Joe Burrow (QB, out) ~6.5 pts',
        'KC: Patrick Mahomes (QB, questionable) ~4.2 pts',
        'CIN: Tee Higgins (WR, questionable) ~2.1 pts'
      ],
      systemEffectiveness: 1.0
    },
    games: {
      'KC_CIN': {
        home: 'KC',
        away: 'CIN',
        homeInjuryImpact: { spread: 3.8, total: 2.1 },
        awayInjuryImpact: { spread: 6.7, total: 5.0 },
        netAdvantage: {
          spread: 2.9,  // KC gets 2.9 points advantage (CIN hurt worse)
          total: 2.9    // Game total goes down 2.9
        }
      }
    }
  };
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testInjuries)
  };
};
