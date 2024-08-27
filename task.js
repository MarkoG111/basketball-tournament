const fs = require('fs')
const path = require('path')

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

// Function to calculate the form of a team based on exhibition results
function calculateTeamForm(exhibitions, allTeamsFIBARanking) {
  const teamForm = {}
  
  Object.keys(exhibitions).forEach(team => {
    let totalForm = 0

    exhibitions[team].forEach(match => {
      const opponentFIBARank = allTeamsFIBARanking[match.Opponent]
      const result = match.Result.split('-').map(Number)
      const scoreDifference = result[0] - result[1] 

      // Calculate form adjustment: consider win/loss, opponent strength, and score difference
      if (scoreDifference > 0) { // Team won
        totalForm += 1 + scoreDifference / 20
        totalForm += (opponentFIBARank > allTeamsFIBARanking[team] ? 0.5 : -0.5) 
      } else { // Team lost
        totalForm += scoreDifference / 20
        totalForm += (opponentFIBARank < allTeamsFIBARanking[team] ? -0.5 : 0.5)
      }
    })

    teamForm[team] = totalForm
  })

  return teamForm
}

async function main() {
  try {
    const groupData = await readJSONFile(path.join(__dirname, 'groups.json'))
    const exhibitionData = await readJSONFile(path.join(__dirname, 'exhibitions.json'))

    const allTeamsFIBARanking = {} // Object to store teams and their rankings
    for (const group of Object.values(groupData)) {
      group.forEach(team => {
        allTeamsFIBARanking[team.ISOCode] = team.FIBARanking
      })
    }

    let teamsForm = calculateTeamForm(exhibitionData, allTeamsFIBARanking)
    console.log(teamsForm)
  } catch (err) {
    console.error(err)
  }
}

main()