'use strict'
import XlsxPopulate from 'xlsx-populate'
import axios from 'axios'
import sleep from 'sleep-promise-native'

const model = 'gpt-4'
const inputTokenCost = 0.00003
const outputTokenCost = 0.00006

const promptTemplate1 = `The occupation "[[title]]" has the following definition:

[[desc]]

Important tasks for this occupation include:

* [[task1]]
* [[task2]]
* [[task3]]
* [[task4]]
* [[task5]]

If a worker in this occupation wanted to join a professional association, which associations would they consider? Provide a list of national or international associations which accept members in the United States. Format the list as a JSON array, with the fields: name, url. If an association has an acronym, do not include it in the 'name' field. If possible, include up to 20 associations in the list. Choose associations most likely to have [[title]] as members.`
const n1 = 6
const temp1 = 1.0
const promptTemplate2 = `Provide a second list of regional associations to consider. Regional associations must represent members across three or more states in the United States. Choose associations most likely to have [[title]] as members.`
const n2 = 4
const temp2 = 1.0

function fillTemplate (template, substitutions)
{
  const replacer = (match, p1, offset, string) => {
    if (Object.hasOwn(substitutions, p1))
      return substitutions[p1]
    return match
  }
  return template.replaceAll(/\[\[(\w+)\]\]/g, replacer)
}

async function callChat (prompt, n, temp, history = [])
{
  const data = {
    model: model,
    n: n,
    temperature: temp,
    messages: history.concat({ role: 'user', content: prompt })
  }
  return await call_axios({
    url: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    data: data,
    timeout: 120000,
    maxRedirects: 0,
    headers: { Authorization: `Bearer ${process.env.OPENAI_TOKEN}` }
  }, 3)
}

async function call_axios(config, retries) {
  let err = undefined
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios(config)
      if (response.status == 200) {
        return response.data
      } else {
        err = `Received error code ${response.status}`
      }
    } catch (error) {
      if (error.response) {
        err = `Received error code ${error.response.status}`
        console.error(error.response.data)
        
      } else if (error.request) {
        err = `No response`
        // console.error(error.request)
      } else if (error.message) {
        err = `Failed with reason "${error.message}"`
      }
    }
    await sleep(250)
  }
  throw new Error(`Call to ${config.url} failed: ${err}`)
}

async function readToBuffer (stream) {
  let bufchunks = []
  for await (const chunk of stream) {
    bufchunks.push(chunk)
  }
  return Buffer.concat(bufchunks)
}

;
(async () => {
  let inputTokens = 0
  let outputTokens = 0
  let occsProcessed = 0
  let specificModel = model

  const xout = await XlsxPopulate.fromBlankAsync()
  const sheet0 = xout.sheet(0)
  sheet0.name('Associations')
  for (const col of 'ABCDEFG'.split('')) {
    sheet0.column(col).style({ fontFamily: 'Times New Roman', fontSize: 12, wrapText: true, verticalAlignment: 'top' })
  }
  sheet0.row(1).style({ bold: true, verticalAlignment: 'bottom' })
  sheet0.column('A').width(12).style({ horizontalAlignment: 'right' })
  sheet0.column('B').width(20).style({ horizontalAlignment: 'right' })
  sheet0.column('C').width(60).style({ horizontalAlignment: 'left' })
  sheet0.column('D').width(60).style({ horizontalAlignment: 'left' })
  sheet0.column('E').width(60).style({ horizontalAlignment: 'left' })
  sheet0.column('F').width(12).style({ horizontalAlignment: 'right' })
  sheet0.column('G').width(12).style({ horizontalAlignment: 'right' })
  sheet0.cell('A1').value([
    [ 'OID', 'O*NET-SOC Code', 'O*NET-SOC Title',
      'Association Name', 'Association URL',
      'Prompt Number', 'Response Number',
    ]
  ])
  sheet0.range('A1:G1').style({ fill: 'ffff99', border: 'thin' })

  const sheet1 = xout.addSheet('Parameters')
  for (const col of 'AB'.split('')) {
    sheet1.column(col).style({ fontFamily: 'Times New Roman', fontSize: 12, wrapText: true, verticalAlignment: 'top' })
  }
  sheet1.column('A').width(40).style({ horizontalAlignment: 'right' })
  sheet1.column('B').width(80).style({ horizontalAlignment: 'left' })
  sheet1.range('A1:B8').value([
    [ 'Model', model ],
    [ 'Prompt 1 - Template', promptTemplate1 ],
    [ 'Prompt 1 - N (Responses)', n1 ],
    [ 'Prompt 1 - Temperature (Creativity)', temp1 ],
    [ 'Prompt 2 - Template', promptTemplate2 ],
    [ 'Prompt 2 - N (Responses)', n2 ],
    [ 'Prompt 2 - Temperature (Creativity)', temp2 ],
    [ 'Total Cost', 0 ],
  ])
  sheet1.range('A1:A8').style({ bold: true, fill: 'ffff99', border: 'thin' })

  const outRows = []

  const xin = await XlsxPopulate.fromDataAsync(await readToBuffer(process.stdin))
  for (const sheet of xin.sheets()) {
    for (const row of sheet.usedRange().cells()) {
      const oid = parseInt(row[0].value())
      if (!oid) {
        continue
      }
      const onetSocCode = row[1].value().toString().trim().replace(/\s+/g, ' ')
      const onetSocTitle = row[2].value().toString().trim().replace(/\s+/g, ' ')
      const onetSocDescription = row[3].value().toString().trim().replace(/\s+/g, ' ')
      const onetSocTaskList = row[4].value().toString().trim()

      console.warn(`Processing ${onetSocCode} - ${onetSocTitle}`)

      const substitutions = {
        code: onetSocCode,
        title: onetSocTitle,
        desc: onetSocDescription
      }
      if (true) {
        const taskArray = onetSocTaskList.split(/\r?\n/)
        for (let i = 0; i < taskArray.length; ++i) {
          substitutions[`task${i + 1}`] = taskArray[i].trim().replace(/\s+/g, ' ')
        }
      }

      const seenAssociations = {}

      const prompt1 = fillTemplate(promptTemplate1, substitutions)
      const result1 = await callChat(prompt1, n1, temp1)
      occsProcessed++
      specificModel = result1.model
      inputTokens += result1.usage.prompt_tokens
      outputTokens += result1.usage.completion_tokens

      for (let i = 0; i < result1.choices.length; ++i) {
        try {
          const mdata = JSON.parse(result1.choices[i].message.content)
          for (let assn of mdata) {
            if (!Object.hasOwn(seenAssociations, assn.url)) {
              outRows.push([ oid, onetSocCode, onetSocTitle, assn.name, assn.url, 1, i + 1 ])
              seenAssociations[assn.url] = true
            }
          }
        } catch (e) {
          console.warn(`Could not parse output from GPT (prompt 1, choice ${i})`)
        }
      }

      const prompt2 = fillTemplate(promptTemplate2, substitutions)
      const result2 = await callChat(prompt2, n2, temp2, [
          { role: 'user', content: prompt1 },
          result1.choices[0].message,
      ])
      inputTokens += result2.usage.prompt_tokens
      outputTokens += result2.usage.completion_tokens

      for (let i = 0; i < result2.choices.length; ++i) {
        try {
          const mdata = JSON.parse(result2.choices[i].message.content)
          for (let assn of mdata) {
            if (!Object.hasOwn(seenAssociations, assn.url)) {
              outRows.push([ oid, onetSocCode, onetSocTitle, assn.name, assn.url, 2, i + 1 ])
              seenAssociations[assn.url] = true
            }
          }
        } catch (e) {
          console.warn(`Could not parse output from GPT (prompt 2, choice ${i})`)
        }
      }
    }
  }

  sheet0.cell('A2').value(outRows)
  sheet1.cell('B1').value(`${model} (${specificModel})`)
  sheet1.cell('B8').value('$' + Number.parseFloat((inputTokens * inputTokenCost) + (outputTokens * outputTokenCost)).toFixed(2).toString())
    process.stdout.write(await xout.outputAsync())

})().catch(err => {
  console.error(err)
  process.exitCode = 1
  process.exit()
})
