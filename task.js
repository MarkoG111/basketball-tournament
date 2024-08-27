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

async function main() {
  try {
    const groupData = await readJSONFile(path.join(__dirname, 'groups.json'))
    const exhibitionData = await readJSONFile(path.join(__dirname, 'exhibitions.json'))

    console.log('Grupna faza - I kolo:')
    console.log('Grupa A')
    console.log(groupData['A'][0]['Team'] + ' - ' + groupData['A'][2]['Team'] + ' (85:79)')
    console.log(groupData['A'][1]['Team'] + ' - ' + groupData['A'][3]['Team'] + ' (92:80)')
    console.log('\n' + groupData['A'][0]['FIBARanking'] + '-' + groupData['A'][1]['FIBARanking'] + '-' + groupData['A'][2]['FIBARanking'] + '-' + groupData['A'][3]['FIBARanking'])
  } catch (err) {
    console.error(err)
  }
}


main()