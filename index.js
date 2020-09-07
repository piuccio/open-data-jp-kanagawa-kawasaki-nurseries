const fs = require('fs');
const util = require('util');
const {get} = require('simple-get-promise');
const convert = require('html-to-json-data');
const {group, text, href} = require('html-to-json-data/definitions');
const writeFile = util.promisify(fs.writeFile);

const PAGE = 'http://www.city.kawasaki.jp/kurashi/category/17-2-10-1-3-0-0-0-0-0.html';

async function start() {
  const {responseText: content} = await get(PAGE);
  const list = convert(content, group('.catlst li', {
    name: text('a'),
    link: href('a', PAGE),
    address: text('p'),
  }));
  list.forEach((item) => {
    const [,codeBefore, codeAfter, address] = item.address.match(/^〒?\s?(\d{3})[-－](\d{4})\s+(.*)/);
    item.address = address;
    item.postcode = `${codeBefore}-${codeAfter}`;
  });
  await writeFile('output/nurseries.json', JSON.stringify(list, null, 2));
}

if (module === require.main) {
  start()
    .then(() => console.log('DONE'))
    .catch(console.error);
}