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

// Simulate all group stage matches based on the FIBA rankings and team form, generating scores for each match
function simulateGroupStageMatches(groupsData, FIBARankings, teamForm, pointsTable) {
  const groupFixtures = {}
  const formUpdates = {}

  for (const group in groupsData) {
    const teams = groupsData[group].map(t => t)

    const totalFixtures = teams.length - 1
    const totalTeams = teams.length

    groupFixtures[group] = []
    formUpdates[group] = []

    for (let fixtureRound = 0; fixtureRound < totalFixtures; fixtureRound++) {
      const fixtureMatches = []

      for (let i = 0; i < totalTeams / 2; i++) {
        const team1 = teams[i]
        const team2 = teams[totalTeams - 1 - i]

        const [team1Score, team2Score] = determineMatchOutcome(team1.ISOCode, team2.ISOCode, FIBARankings, teamForm)

        let { outcome, surrenderedTeam } = getMatchOutcome(team1.ISOCode, team2.ISOCode, team1Score, team2Score)

        updatePointsTable(pointsTable, team1.Team, team2.Team, team1Score, team2Score, outcome)

        const originalFormTeam1 = teamForm[team1.ISOCode]
        const originalFormTeam2 = teamForm[team2.ISOCode]

        // Adjust team form based on match result
        adjustTeamFormBasedOnMatchOutcome(team1.ISOCode, team2.ISOCode, team1Score, team2Score, teamForm)

        formUpdates[group].push({
          match: `${team1.Team} - ${team2.Team}`,
          score: `${Math.round(team1Score)}:${Math.round(team2Score)}`,
          formUpdates: [
            { team: team1.Team, from: originalFormTeam1, to: teamForm[team1.ISOCode] },
            { team: team2.Team, from: originalFormTeam2, to: teamForm[team2.ISOCode] }
          ]
        })

        fixtureMatches.push({
          match: `${team1.Team} - ${team2.Team}`,
          score: `${Math.round(team1Score)}:${Math.round(team2Score)}`,
          outcome: outcome,
          surrenderedTeam: surrenderedTeam ? teams.find(team => team.ISOCode === surrenderedTeam).Team : null
        })
      }

      groupFixtures[group].push(fixtureMatches)

      const lastTeam = teams.pop()
      teams.splice(1, 0, lastTeam)
    }
  }

  rankTeamsWithinGroups(groupsData, pointsTable, groupFixtures)

  return { groupFixtures, formUpdates }
}

// Determine the outcome of a match based on FIBA rankings and other factors like team form 
function determineMatchOutcome(team1, team2, FIBARankings, teamForm) {
  const minScore = 44
  const maxScore = 122

  const ranking1 = FIBARankings[team1]
  const ranking2 = FIBARankings[team2]

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

function initializePointsTable(teams, ISOToTeamName) {
  const pointsTable = {}

  const fullTeamNames = teams.map(isoCode => ISOToTeamName[isoCode])

  for (const team of fullTeamNames) {
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

function getMatchOutcome(team1, team2, team1Score, team2Score) {
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

// Rank teams within each group based on points, score difference, and other tie-breaking criteria
function rankTeamsWithinGroups(groupsData, pointsTable, groupFixtures) {
  for (const group in groupsData) {
    const teams = groupsData[group].map(t => t.Team)

    teams.sort((teamA, teamB) => {
      const pointsA = pointsTable[teamA].points
      const pointsB = pointsTable[teamB].points

      if (pointsA !== pointsB) {
        return pointsB - pointsA
      }

      return resolveTieBetweenTeams(group, teamA, teamB, groupFixtures)
    })

    groupsData[group] = teams.map(isoCode => ({ ISOCode: isoCode }))
  }
}

function resolveTieBetweenTeams(group, teamA, teamB, groupFixtures) {
  const matches = getAllMatchesForGroup(groupFixtures, group)

  // Filter matches for head-to-head results between the two teams
  const headToHeadMatches = matches.filter(match =>
    (match.match.includes(`${teamA} vs ${teamB}`) || match.match.includes(`${teamB} vs ${teamA}`))
  )

  if (headToHeadMatches.length > 0) {
    let teamAScore = 0
    let teamBScore = 0

    headToHeadMatches.forEach(match => {
      const [scoreA, scoreB] = match.score.split('-').map(Number)

      if (match.match.includes(teamA)) {
        teamAScore += scoreA
        teamBScore += scoreB
      } else {
        teamAScore += scoreB
        teamBScore += scoreA
      }
    })

    const headToHeadDifference = teamAScore - teamBScore

    if (headToHeadDifference !== 0) {
      return headToHeadDifference
    }
  }

  // Calculate the round-robin difference for the teams within the tied teams
  const roundRobinDifferenceA = calculateRoundRobinDifference(teamA, matches)
  const roundRobinDifferenceB = calculateRoundRobinDifference(teamB, matches)

  return roundRobinDifferenceB - roundRobinDifferenceA
}

function getAllMatchesForGroup(groupFixtures, group) {
  let matches = []

  for (const fixture of groupFixtures[group]) {
    matches = matches.concat(fixture)
  }

  return matches
}

/** Calculates the total round-robin difference for a specific team based on their match results
 * @param {string} team - The name or identifier of the team whose round-robin difference is to be calculated
 * @param {Array} matches - Array of match objects where each object contains details about the match
 * @returns {number} - The total round-robin difference for the specified team
 */
function calculateRoundRobinDifference(team, matches) {
  let totalRoundRobinDifference = 0

  matches.forEach(match => {
    // Check if the team is involved in the current match
    if (match.match.includes(team)) {
      // Split the score string into individual scores and convert them to numbers
      const [score1, score2] = match.score.split('-').map(Number)

      // Determine if the team is team1 or team2 in the match
      const isTeam1 = match.match.startsWith(team)

      // Calculate the round-robin difference based on whether the team is team1 or team2
      // If the team is team1, the difference is score1 - score2
      // If the team is team2, the difference is score2 - score1
      totalRoundRobinDifference += isTeam1 ? (score1 - score2) : (score2 - score1)
    }
  })

  return totalRoundRobinDifference
}

function rankTeamsAfterGroupStage(groupsData, pointsTable) {
  // Sort teams by metrics: points, score difference, and total points scored
  // Return an ordered list of teams for knockout seedings 
  const rankedTeams = { first: [], second: [], third: [] }

  for (const group in groupsData) {
    const teams = groupsData[group].map(t => t.ISOCode)

    rankedTeams.first.push(teams[0])
    rankedTeams.second.push(teams[1])
    rankedTeams.third.push(teams[2])
  }

  rankedTeams.first = rankTeamsByCriteria(rankedTeams.first, pointsTable)
  rankedTeams.second = rankTeamsByCriteria(rankedTeams.second, pointsTable)
  rankedTeams.third = rankTeamsByCriteria(rankedTeams.third, pointsTable)

  return rankedTeams
}

/** Rank the top teams from each group to assign rankings for knockout stage seeding
* @param {Array} teams - Array of team names or identifiers to be ranked
* @param {Object} pointsTable - Object mapping team names/identifiers to their performance metrics
* @returns {Array} - Array of teams sorted by ranking criteria
*/
function rankTeamsByCriteria(teams, pointsTable) {
  return teams.sort((teamA, teamB) => {
    // Retrieve the points for both teams from the pointsTable
    const pointsA = pointsTable[teamA].points
    const pointsB = pointsTable[teamB].points

    // Compare teams based on points
    if (pointsA !== pointsB) {
      return pointsB - pointsA // Higher points are ranked higher
    }

    // If points are equal, compare teams based on score difference
    const scoreDifferenceA = pointsTable[teamA].scoreDifference
    const scoreDifferenceB = pointsTable[teamB].scoreDifference

    if (scoreDifferenceA !== scoreDifferenceB) {
      return scoreDifferenceB - scoreDifferenceA
    }

    // If both points and score difference are equal, compare teams based on scored points
    const scoredPointsA = pointsTable[teamA].scoredPoints
    const scoredPointsB = pointsTable[teamB].scoredPoints

    return scoredPointsB - scoredPointsA // Higher scored points are ranked higher
  })
}

function getTopTeamsAfterGroupStage(rankedTeams) {
  return [
    ...rankedTeams.first.slice(0, 3),
    ...rankedTeams.second.slice(0, 3),
    ...rankedTeams.third.slice(0, 3)
  ]
}

// Determine knockout stage seedings based on group performance
function determineKnockoutStageSeedings(rankedTeams, groupsData) {
  // Divide teams into pots (D, E, F, G) based on their rankings 
  // Create quarterfinal matchups avoiding same-group matchups
  // Rerturn an object representing the knkockout stage matchups
  const potD = [rankedTeams.first[0], rankedTeams.first[1]]
  const potE = [rankedTeams.first[2], rankedTeams.second[0]]
  const potF = [rankedTeams.second[1], rankedTeams.second[2]]
  const potG = [rankedTeams.third[0], rankedTeams.third[1]]

  const originalPots = {
    D: [...potD],
    E: [...potE],
    F: [...potF],
    G: [...potG],
  }

  // A better shuffle function that does not mutate the original array
  function shuffle(array) {
    const shuffledArray = array.slice() // Create a copy of the array

    for (let i = shuffledArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));

      [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]]; // Swap elements
    }

    return shuffledArray
  }

  const shuffledPotD = shuffle(potD)
  const shuffledPotE = shuffle(potE)
  const shuffledPotF = shuffle(potF)
  const shuffledPotG = shuffle(potG)

  let knockoutMatchups = []

  function createMatchup(pot1, pot2) {
    while (pot1.length > 0) {
      let team1 = pot1.shift()
      let matched = false

      for (let i = 0; i < pot2.length; i++) {
        let team2 = pot2[i]

        if (!wereInSameGroup(team1, team2, groupsData)) {
          knockoutMatchups.push({ home: team1, away: team2 })
          pot2.splice(i, 1)
          matched = true
          break
        }
      }

      if (!matched && pot2.length > 0) {
        let team2 = pot2.shift()
        knockoutMatchups.push({ home: team1, away: team2 })
      }
    }
  }

  function wereInSameGroup(team1, team2, groupsData) {
    for (const group in groupsData) {
      const teamsInGroup = groupsData[group].map(team => team.Team)

      if (teamsInGroup.includes(team1) && teamsInGroup.includes(team2)) {
        return true
      }
    }

    return false
  }

  createMatchup(shuffledPotD, shuffledPotG)
  createMatchup(shuffledPotE, shuffledPotF)

  const formattedOutput = {
    pots: originalPots,
    quarterfinals: knockoutMatchups
  }

  return formattedOutput
}

function printDraw(result) {
  let output = 'Pots:\n'

  for (const [potName, teams] of Object.entries(result.pots)) {
    output += `    Pot ${potName}\n`
    teams.forEach(team => {
      output += `        ${team}\n`
    })
  }

  output += '\nElimination round: \n'

  result.quarterfinals.forEach(matchup => {
    output += `    ${matchup.home} - ${matchup.away}\n`
  })

  console.log(output)
}

// Print the results and standings after the group stage 
function printGroupStageResultsAndStandings(groupsData, pointsTable) {
  console.log('\n\nFinal Group Stage Standings:')

  for (const group in groupsData) {
    console.log(`\nGroup ${group}`)

    const teamStats = []

    const teams = groupsData[group].map(team => team.ISOCode)

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

    console.log(`Rank | Team               | Points | Wins | Losses | ScoredPoints | ReceivedPoints | Difference`)

    teamStats.forEach(({ Rank, Team, Points, Wins, Losses, ScoredPoints, ReceivedPoints, Difference }) => {
      const formattedDifference = Difference >= 0 ? `+${Difference}` : `${Difference}`
      console.log(`${Rank.toString().padEnd(4)} | ${Team.padEnd(18)} | ${Points.toString().padEnd(6)} | ${Wins.toString().padEnd(4)} | ${Losses.toString().padEnd(6)} | ${ScoredPoints.toString().padEnd(12)} | ${ReceivedPoints.toString().padEnd(14)} | ${formattedDifference}`)
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

function printInitialTeamForm(teamForm) {
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
          console.log(`   ${match.match} - Outcome: ${match.outcome}, Surrendered Team: ${match.surrenderedTeam}`)
        } else {
          console.log(`   ${match.match} (${match.score})`)

          const matchUpdates = formUpdates[group].find(m => m.match === match.match)
          if (matchUpdates) {
            matchUpdates.formUpdates.forEach(update => {
              console.log(`     Form update for ${update.team}: ${update.from.toFixed(2)} -> ${update.to.toFixed(2)}`)
            })
          }
        }
      })
    }
  }
}

function displayFinalRanking(topTeams) {
  console.log("\nFinal Rankings:")

  for (let i = 0; i < topTeams.length; i++) {
    console.log(`${i + 1}. ${topTeams[i]}`)

    if (i === 7) {
      console.log("-------- Teams below this line are eliminated --------")
    }
  }

  console.log(`\nTeams that advance to the knockout stage: ${topTeams.slice(0, 8).join(", ")}\n`)
}

function simulateQuarterfinalMatches(quarterfinalTeams, FIBARankings, teamForm) {
  const quarterfinalResults = []
  const winners = []

  const teamList = Object.values(quarterfinalTeams)

  // Kroz timove u parovima
  for (let i = 0; i < teamList.length; i += 2) {
    const team1 = teamList[i]
    const team2 = teamList[i + 1]

    const [team1Score, team2Score] = determineMatchOutcome(team1.ISOCode, team2.ISOCode, FIBARankings, teamForm)

    const outcome = getMatchOutcome(team1.ISOCode, team2.ISOCode, team1Score, team2Score)

    const result = {
      match: `${team1.TeamName} - ${team2.TeamName}`,
      outcome: outcome.outcome,
    }

    if (outcome.outcome === 'surrender') {
      result.surrenderedTeam = team1Score > team2Score ? team2.TeamName : team1.TeamName
      winners.push(team1Score > team2Score ? team1 : team2)
    } else {
      result.score = `${team1Score}:${team2Score}`
      winners.push(team1Score > team2Score ? team1 : team2)
      adjustTeamFormBasedOnMatchOutcome(team1.ISOCode, team2.ISOCode, team1Score, team2Score, teamForm)
    }

    quarterfinalResults.push(result)

    adjustTeamFormBasedOnMatchOutcome(team1.ISOCode, team2.ISOCode, team1Score, team2Score, teamForm)
  }

  return { quarterfinalResults, winners }
}

function printQuarterfinalResults(results) {
  console.log("Quarterfinals:")

  results.forEach(result => {
    if (result.outcome === 'surrender') {
      console.log(`    ${result.match} (Surrendered by: ${result.surrenderedTeam})`)
    } else {
      console.log(`    ${result.match} (${result.score})`)
    }
  })
}

function determineSemifinalMatches(winners) {
  const semifinals = [
    [winners[0], winners[2]],
    [winners[1], winners[3]]
  ]

  return semifinals
}

function simulateSemifinalMatches(semifinalTeams, FIBARankings, teamForm) {
  const semifinalResults = []
  const finalists = []
  const losers = []

  for (const [team1, team2] of semifinalTeams) {
    const [team1Score, team2Score] = determineMatchOutcome(team1.ISOCode, team2.ISOCode, FIBARankings, teamForm)

    let outcome = getMatchOutcome(team1.ISOCode, team2.ISOCode, team1Score, team2Score)

    const result = {
      match: `${team1.TeamName} - ${team2.TeamName}`,
      outcome: outcome.outcome
    }

    if (outcome.outcome === 'surrender') {
      result.surrenderedTeam = team1Score > team2Score ? team2.TeamName : team1.TeamName

      const winner = team1Score > team2Score ? team1 : team2
      const loser = team1Score > team2Score ? team2 : team1

      finalists.push(winner)
      losers.push(loser)
    } else {
      result.score = `${team1Score}:${team2Score}`

      const winner = team1Score > team2Score ? team1 : team2
      const loser = team1Score > team2Score ? team2 : team1

      finalists.push(winner)
      losers.push(loser)

      adjustTeamFormBasedOnMatchOutcome(team1.ISOCode, team2.ISOCode, team1Score, team2Score, teamForm)
    }

    semifinalResults.push(result)

    adjustTeamFormBasedOnMatchOutcome(team1.ISOCode, team2.ISOCode, team1Score, team2Score, teamForm)
  }

  return { semifinalResults, finalists, losers }
}

function printSemifinalResults(results) {
  console.log("\nSemifinals:")

  results.forEach(result => {
    if (result.outcome === 'surrender') {
      console.log(`    ${result.match} (Surrenderd by: ${result.surrenderedTeam})`)
    } else {
      console.log(`    ${result.match} (${result.score})`)
    }
  })
}

function simulateFinalMatch(winners, FIBARankings, teamForm) {
  const [team1, team2] = winners

  const [finalScore1, finalScore2] = determineMatchOutcome(team1.ISOCode, team2.ISOCode, FIBARankings, teamForm)
  const finalOutcome = getMatchOutcome(team1.ISOCode, team2.ISOCode, finalScore1, finalScore2)

  const finalResult = {
    match: `${team1.TeamName} - ${team2.TeamName}`,
    outcome: finalOutcome.outcome,
    winner: null,
    loser: null,
    score: ''
  }

  if (finalOutcome.outcome === 'surrender') {
    finalResult.surrenderedTeam = finalScore1 > finalScore2 ? team2.TeamName : team1.TeamName
    finalResult.winner = finalScore1 > finalScore2 ? team1 : team2
    finalResult.loser = finalScore1 > finalScore2 ? team2 : team1
  } else {
    finalResult.score = `${finalScore1}:${finalScore2}`
    finalResult.winner = finalScore1 > finalScore2 ? team1 : team2
    finalResult.loser = finalScore1 > finalScore2 ? team2 : team1

    adjustTeamFormBasedOnMatchOutcome(team1.ISOCode, team2.ISOCode, finalScore1, finalScore2, teamForm)
  }

  return { finalResult, finalWinner: finalResult.winner, finalLoser: finalResult.loser }
}

function printFinalMatch(finalResult) {
  let finalOutput = "\nFinal:\n"

  if (finalResult.outcome === 'surrender') {
    finalOutput += `    ${finalResult.match} (Surrendered by: ${finalResult.surrenderedTeam})\n`
  } else {
    finalOutput += `    ${finalResult.match} (${finalResult.score})\n`
  }

  console.log(finalOutput)
}

function simulateThirdPlaceMatch(losers, FIBARankings, teamForm) {
  const [team1, team2] = losers

  const [thirdPlaceScore1, thirdPlaceScore2] = determineMatchOutcome(team1.ISOCode, team2.ISOCode, FIBARankings, teamForm)
  const thirdPlaceOutcome = getMatchOutcome(team1.ISOCode, team2.ISOCode, thirdPlaceScore1, thirdPlaceScore2)

  const thirdPlaceResult = {
    match: `${team1.TeamName} vs ${team2.TeamName}`,
    outcome: thirdPlaceOutcome.outcome,
    score: ''
  }

  let thirdPlaceWinner

  if (thirdPlaceOutcome.outcome === 'surrender') {
    thirdPlaceResult.surrenderedTeam = thirdPlaceScore1 > thirdPlaceScore2 ? team2.TeamName : team1.TeamName
    thirdPlaceWinner = thirdPlaceScore1 > thirdPlaceScore2 ? team1 : team2
  } else {
    thirdPlaceResult.score = `${thirdPlaceScore1}:${thirdPlaceScore2}`
    thirdPlaceWinner = thirdPlaceScore1 > thirdPlaceScore2 ? team1 : team2

    adjustTeamFormBasedOnMatchOutcome(team1.ISOCode, team2.ISOCode, thirdPlaceScore1, thirdPlaceScore2, teamForm)
  }

  return { thirdPlaceResult, thirdPlaceWinner }
}

function printThirdPlaceMatch(result) {
  console.log("\nThird Place Match:")

  if (result.outcome === 'surrender') {
    console.log(`    ${result.match} (Surrendered by: ${result.surrenderedTeam})`)
  } else {
    console.log(`    ${result.match} (${result.score})`)
  }
}

function printMedalStandings(finalWinner, finalLoser, thirdPlaceWinner) {
  console.log('Medals:')

  console.log(`🥇 1. ${finalWinner.TeamName}`)
  console.log(`🥈 2. ${finalLoser.TeamName}`)
  console.log(`🥉 3. ${thirdPlaceWinner.TeamName}`)
}

async function simulateTournament() {
  try {
    const groupsData = await readJSONFile(path.join(__dirname, 'groups.json'))
    const exhibitionData = await readJSONFile(path.join(__dirname, 'exhibitions.json'))

    let teams = Object.keys(exhibitionData)
    const teamForm = simulateExhibitionMatches(exhibitionData, teams)

    const ISOToTeamName = {}
    for (const group of Object.values(groupsData)) {
      for (const team of group) {
        ISOToTeamName[team.ISOCode] = team.Team
      }
    }

    printInitialTeamForm(teamForm)

    const pointsTable = initializePointsTable(teams, ISOToTeamName)

    const FIBARankings = {}
    for (const group in groupsData) {
      for (const team of groupsData[group]) {
        FIBARankings[team.ISOCode] = team.FIBARanking
      }
    }

    const { groupFixtures, formUpdates } = simulateGroupStageMatches(groupsData, FIBARankings, teamForm, pointsTable)

    printFixturesByGroupPhase(groupFixtures, formUpdates)
    printGroupStageResultsAndStandings(groupsData, pointsTable)

    const rankedTeams = rankTeamsAfterGroupStage(groupsData, pointsTable)
    const topTeams = getTopTeamsAfterGroupStage(rankedTeams)

    displayFinalRanking(topTeams)

    const knockoutTeams = determineKnockoutStageSeedings(rankedTeams, groupsData)
    printDraw(knockoutTeams)

    const knockoutTeamsInfo = knockoutTeams.quarterfinals.reduce((result, match) => {
      // For each match, process both the home and away teams
      [match.home, match.away].forEach(teamName => {
        // Find the ISO code corresponding to the team name
        const ISOCode = Object.keys(ISOToTeamName).find(code => ISOToTeamName[code] === teamName)

        if (ISOCode) {
          // Add the team information to the result object if ISO code is found
          result[ISOCode] = {
            TeamName: teamName,
            CurrentForm: parseFloat(teamForm[ISOCode].toFixed(2)),
            Ranking: FIBARankings[ISOCode],
            ISOCode: ISOCode
          }
        }
      })
      return result
    }, {})

    const { quarterfinalResults, winners } = simulateQuarterfinalMatches(knockoutTeamsInfo, FIBARankings, teamForm)
    printQuarterfinalResults(quarterfinalResults)

    const semifinalTeams = determineSemifinalMatches(winners)

    const { semifinalResults, finalists, losers } = simulateSemifinalMatches(semifinalTeams, FIBARankings, teamForm)
    printSemifinalResults(semifinalResults)

    const { thirdPlaceResult, thirdPlaceWinner } = simulateThirdPlaceMatch(losers, FIBARankings, teamForm)
    printThirdPlaceMatch(thirdPlaceResult)

    const { finalResult, finalWinner, finalLoser } = simulateFinalMatch(finalists, FIBARankings, teamForm)
    printFinalMatch(finalResult)

    printMedalStandings(finalWinner, finalLoser, thirdPlaceWinner)
  } catch (err) {
    console.error(err)
  }
}

simulateTournament()