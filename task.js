const { group } = require('console')
const fs = require('fs')
const path = require('path')

// Read and parse JSON files to get data about teams and exhibition matches
function readJSONFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        reject(err)
      } else {
        try {
          resolve(JSON.parse(data))
        } catch (parseError) {
          reject(parseError)
        }
      }
    })
  })
}

// Simulate exhibtion matches to adjust inital team from before the tournament starts 
function simulateExhibitionMatches(exhibitionData, teams) {
  let teamForm = {}
  let processedMatches = new Set()

  for (const team of teams) {
    teamForm[team] = 0
  }

  for (const [team, matches] of Object.entries(exhibitionData)) {
    for (const match of matches) {
      const matchId = `${team}-${match.Opponent}`
      const reverseMatchId = `${match.Opponent}-${team}`

      if (processedMatches.has(reverseMatchId)) {
        continue
      }

      processedMatches.add(matchId)

      const [teamScore, opponentScore] = match.Result.split('-').map(Number)
      const scoreDifference = teamScore - opponentScore

      if (scoreDifference > 0) {
        teamForm[team] += 0.1
        teamForm[match.Opponent] -= 0.1
      } else if (scoreDifference < 0) {
        teamForm[team] -= 0.1
        teamForm[match.Opponent] += 0.1
      }

      if (Math.abs(scoreDifference) >= 15) {
        const adjustment = scoreDifference > 0 ? 0.05 : -0.05
        teamForm[team] += adjustment
        teamForm[match.Opponent] -= adjustment
      }
    }
  }

  return teamForm
}

// Calculate and adjust team forms based on exhibtion matches and ongoing results 
function calculateTeamForm(exhibitionData, teams) {

}

// Simulate all group stage matches based on the FIBA rankings and team form, generating scores for each match
function simulateGroupStageMatches(groupsData, rankings, teamForm, pointsTable) {
  const groupFixtures = {}
  const formUpdates = {}

  for (const group in groupsData) {
    const teams = groupsData[group].map(t => t.ISOCode)

    const totalFixtures = teams.length - 1
    const totalTeams = teams.length

    groupFixtures[group] = []
    formUpdates[group] = []

    for (let fixtureRound = 0; fixtureRound < totalFixtures; fixtureRound++) {
      const fixtureMatches = []

      for (let i = 0; i < totalTeams / 2; i++) {
        const team1 = teams[i]
        const team2 = teams[totalTeams - 1 - i]

        const [team1Score, team2Score] = determineMatchOutcome(team1, team2, rankings, teamForm)

        let { outcome, surrenderedTeam } = getMathcOutcome(team1, team2, team1Score, team2Score)

        updatePointsTable(pointsTable, team1, team2, team1Score, team2Score, outcome)

        const originalFormTeam1 = teamForm[team1]
        const originalFormTeam2 = teamForm[team2]

        // Adjust team form based on match result
        adjustTeamFormBasedOnMatchOutcome(team1, team2, team1Score, team2Score, teamForm)

        formUpdates[group].push({
          match: `${team1} vs ${team2}`,
          score: `${Math.round(team1Score)}-${Math.round(team2Score)}`,
          formUpdates: [
            { team: team1, from: originalFormTeam1, to: teamForm[team1] },
            { team: team2, from: originalFormTeam2, to: teamForm[team2] }
          ]
        })

        fixtureMatches.push({
          match: `${team1} vs ${team2}`,
          score: `${Math.round(team1Score)}-${Math.round(team2Score)}`,
          outcome: outcome,
          surrenderedTeam: surrenderedTeam
        })
      }

      groupFixtures[group].push(fixtureMatches)

      const lastTeam = teams.pop()
      teams.splice(1, 0, lastTeam)
    }
  }

  printGroupStageResultsAndStandings(groupsData, pointsTable)

  return { groupFixtures, formUpdates }
}

// Determine the outcome of a match based on FIBA rankings and other factors like team form 
function determineMatchOutcome(team1, team2, rankings, teamForm) {
  const minScore = 44
  const maxScore = 122

  const ranking1 = rankings[team1]
  const ranking2 = rankings[team2]

  const form1 = teamForm[team1].toFixed(2)
  const form2 = teamForm[team2].toFixed(2)

  const rankingDifference = (ranking2 - ranking1)

  const baseScore1 = (80 + (20 - (ranking1 - form1))) * (1 + Math.random() * 0.1)
  const baseScore2 = (80 + (20 - (ranking2 - form2))) * (1 + Math.random() * 0.1)

  const variability = 10
  let score1 = baseScore1 + (Math.random() * variability - variability / 2) - rankingDifference
  let score2 = baseScore2 + (Math.random() * variability - variability / 2) - rankingDifference

  const finalScore1 = Math.max(minScore, Math.min(maxScore, Math.round(score1)))
  const finalScore2 = Math.max(minScore, Math.min(maxScore, Math.round(score2)))

  return [finalScore1, finalScore2]
}

function initializePointsTable(teams) {
  const pointsTable = {}

  for (const team of teams) {
    pointsTable[team] = {
      points: 0,
      wins: 0,
      losses: 0,
      scoreDifference: 0,
      scoredPoints: 0,
      receivedPoints: 0
    }
  }

  return pointsTable
}

function getMathcOutcome(team1, team2, team1Score, team2Score) {
  const randomChance = Math.random()
  const surrenderProbability = 0.05

  if (randomChance < surrenderProbability) {
    return {
      outcome: 'surrender',
      surrenderedTeam: Math.random() < 0.5 ? team1 : team2
    }
  }

  if (team1Score > team2Score) {
    return { outcome: 'win', surrenderedTeam: null }
  } else if (team1Score < team2Score) {
    return { outcome: 'loss', surrenderedTeam: null }
  } else {
    return { outcome: 'win', surrenderedTeam: null }
  }
}

// Update the points table, for both teams, based on match outcomes (2 points for a win, 1 for a loss, 0 for a loss with surrender)
function updatePointsTable(pointsTable, team1, team2, team1Score, team2Score, outcome) {
  const points = { [team1]: 0, [team2]: 0 }

  if (outcome === 'surrender') {
    team1Score = 0
    team2Score = 0
  }

  const roundedTeam1Score = Math.round(team1Score)
  const roundedTeam2Score = Math.round(team2Score)

  const scoreDifference = roundedTeam1Score - roundedTeam2Score

  pointsTable[team1].scoredPoints += roundedTeam1Score
  pointsTable[team1].receivedPoints += roundedTeam2Score
  pointsTable[team2].scoredPoints += roundedTeam2Score
  pointsTable[team2].receivedPoints += roundedTeam1Score

  if (outcome === 'win') {
    points[team1] = 2
    points[team2] = 1
    pointsTable[team1].wins += 1
    pointsTable[team2].losses += 1
  } else if (outcome === 'loss') {
    points[team1] = 1
    points[team2] = 2
    pointsTable[team1].losses += 1
    pointsTable[team2].wins += 1
  } else if (outcome === 'surrender') {
    points[team1] = 2
    points[team2] = 0
    pointsTable[team1].wins += 1
    pointsTable[team2].losses += 1
  }

  pointsTable[team1].points += points[team1]
  pointsTable[team2].points += points[team2]
  pointsTable[team1].scoreDifference += scoreDifference
  pointsTable[team2].scoreDifference -= scoreDifference
}

// Update the standings of each group based on match outcomes, keeping track of wins, losses, points, and score differneces
function updateGroupStandings(groupsData, pointsTable) {

}

// Rank teams within each group based on points, score difference, and other tie-breaking criteria
function rankTeamsWithinGroups(groupsData) {

}

// Rank the top teams from each group to assign rankings for knockout stage seeding
function rankTopTeamsForKnockoutStage(groupsData) {
  // Sort teams by metrics: points, score difference, and total points scored
  // Return an ordered list of teams for knockout seedings 
}

// Determine knockout stage seedings based on group performance
function determineKnockoutStageSeedings(rankedTeams) {
  // Divide teams into pots (D, E, F, G) based on their rankings 
  // Create quarterfinal matchups avoiding same-group matchups
  // Rerturn an object representing the knkockout stage matchups
}

// Print the results and standings after the group stage 
function printGroupStageResultsAndStandings(groupsData, pointsTable) {
  console.log('Final Group Stage Standings:')

  for (const group in groupsData) {
    console.log(`Group ${group}`)

    const teams = groupsData[group].map(t => t.ISOCode)

    teams.sort((a, b) => {
      const teamA = pointsTable[a]
      const teamB = pointsTable[b]

      if (teamA.points !== teamB.points) {
        return teamB.points - teamA.points
      }

      if (teamA.points === teamB.points) {

      }

      return 0
    })

    const teamStats = []

    let rank = 1

    for (const team of teams) {
      const stats = pointsTable[team]

      teamStats.push({
        Rank: rank,
        Team: team,
        Points: stats.points,
        Wins: stats.wins,
        Losses: stats.losses,
        ScoredPoints: Math.round(stats.scoredPoints),
        ReceivedPoints: Math.round(stats.receivedPoints),
        Difference: Math.round(stats.scoreDifference)
      })

      rank++
    }

    console.log(`Rank | Team | Points | Wins | Losses | ScoredPoints | ReceivedPoints | Difference`)

    teamStats.forEach(({ Rank, Team, Points, Wins, Losses, ScoredPoints, ReceivedPoints, Difference }) => {
      const formattedDifference = Difference >= 0 ? `+${Difference}` : `${Difference}`
      console.log(`${Rank.toString().padEnd(4)} | ${Team.padEnd(4)} | ${Points.toString().padEnd(6)} | ${Wins.toString().padEnd(4)} | ${Losses.toString().padEnd(6)} | ${ScoredPoints.toString().padEnd(12)} | ${ReceivedPoints.toString().padEnd(14)} | ${formattedDifference}`)
    })
  }
}

// Adjust match outcome probabilities based on the current from of teams
function adjustTeamFormBasedOnMatchOutcome(team1, team2, team1Score, team2Score, teamForm) {
  if (team1Score > team2Score) {
    teamForm[team1] += 0.1
    teamForm[team2] -= 0.1
  } else if (team1Score < team2Score) {
    teamForm[team1] -= 0.1
    teamForm[team2] += 0.1
  }
}

function displayTeamForm(teamForm) {
  console.log('Updated team form after exhibition matches:')

  for (const [team, form] of Object.entries(teamForm)) {
    if (!isNaN(form)) {
      console.log(`${team}: ${form.toFixed(2)}`)
    }
  }
}

function printFixturesByGroupPhase(groupFixtures, formUpdates) {
  const totalPhases = groupFixtures[Object.keys(groupFixtures)[0]].length

  for (let phase = 0; phase < totalPhases; phase++) {
    console.log(`\nGroup phase - ${phase + 1}. fixture`)

    for (const group in groupFixtures) {
      console.log(`Group ${group}:`)

      groupFixtures[group][phase].forEach(match => {
        if (match.outcome === 'surrender') {
          console.log(` ${match.match} - Outcome: ${match.outcome}, Surrendered Team: ${match.surrenderedTeam}`);
        } else {
          console.log(` ${match.match} (${match.score})`)

          const matchUpdates = formUpdates[group].find(m => m.match === match.match)
          if (matchUpdates) {
            matchUpdates.formUpdates.forEach(update => {
              console.log(` Form update for ${update.team}: ${update.from.toFixed(2)} -> ${update.to.toFixed(2)}`)
            })
          }
        }
      })
    }
  }
}

async function main() {
  try {
    const groupsData = await readJSONFile(path.join(__dirname, 'groups.json'))
    const exhibitionData = await readJSONFile(path.join(__dirname, 'exhibitions.json'))

    let teams = Object.keys(exhibitionData)
    const teamForm = simulateExhibitionMatches(exhibitionData, teams)

    displayTeamForm(teamForm)

    const pointsTable = initializePointsTable(teams)

    const FIBARankings = {}
    for (const group in groupsData) {
      for (const team of groupsData[group]) {
        FIBARankings[team.ISOCode] = team.FIBARanking
      }
    }

    const { groupFixtures, formUpdates } = simulateGroupStageMatches(groupsData, FIBARankings, teamForm, pointsTable)

    printFixturesByGroupPhase(groupFixtures, formUpdates)
  } catch (err) {
    console.error(err)
  }
}

main()