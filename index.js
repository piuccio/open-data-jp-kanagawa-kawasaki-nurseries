const fs = require('fs');
const util = require('util');
const {get} = require('simple-get-promise');
const cached = require('@piuccio/cached-function');
const convert = require('html-to-json-data');
const {group, text, href, attr} = require('html-to-json-data/definitions');
const writeFile = util.promisify(fs.writeFile);

const NAKAHARA = 'http://www.city.kawasaki.jp/kurashi/category/17-2-10-1-3-0-0-0-0-0.html';

async function start() {
  const list = await getListByWard(NAKAHARA);
  for (const item of list) {
    const details = await getDetails(item.link);
    Object.assign(item, details);
  }
  await writeFile('output/nurseries.json', JSON.stringify(list.map(getProperties), null, 2));
  await writeFile('output/nurseries.geojson', await geojson(list));
}

const fetch = cached('tmp/pages.json', async (pageUrl) => {
  const {responseText: content} = await get(pageUrl);
  return content;
});

async function getListByWard(pageUrl) {
  const content = await fetch(pageUrl);
  const list = convert(content, group('.catlst li', {
    name: text('a'),
    link: href('a', pageUrl),
    address: text('p'),
  }));
  list.forEach((item) => {
    const [,codeBefore, codeAfter, address] = item.address.match(/^〒?\s?(\d{3})[-－](\d{4})\s+(.*)/);
    item.address = address;
    item.postcode = `${codeBefore}-${codeAfter}`;
  });
  return list;
}

const PHONE_NUMBER_LABEL = /電話(?:\/FAX)?[：:](\d{3})[-－‐（）](\d{3})[-－‐（）](\d{4})/;
const PHONE_NUMBER_NO_LABEL = /^(\d{3})[-－‐（）](\d{3})[-－‐（）](\d{4})/;

async function getDetails(pageUrl) {
  const content = await fetch(pageUrl);
  const details = convert(content, {
    geometry: attr('.mol_gmapblock iframe', 'src'),
    phone: group('.mol_textblock', text('p'))
      .filterBy(text(':self'), (text) => text.match ? text.match(PHONE_NUMBER_LABEL) || text.match(PHONE_NUMBER_NO_LABEL) : false)
      .flat(),
  });
  const [,lat,lon] = details.geometry.match(/\?ll=([\d.]+),([\d.]+)/);
  const [,area,prefix,number] = details.phone[0].match(PHONE_NUMBER_LABEL) || details.phone[0].match(PHONE_NUMBER_NO_LABEL);
  return {
    latitude: Number(lat),
    longitude: Number(lon),
    phone: `${area}-${prefix}-${number}`,
  };
}

async function geojson(list) {
  const json = {
    type: 'FeatureCollection',
    features: [],
  };
  for (const item of list) {
    if (!item.latitude) continue;

    json.features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [item.longitude, item.latitude],
      },
      properties: getProperties(item),
    });
  }
  return JSON.stringify(json, null, 2);
}

const getProperties = (item) => ({
  name: item.name,
  link: item.link,
  address: item.address,
  postcode: item.postcode,
  phone: item.phone,
});

if (module === require.main) {
  start()
    .then(() => console.log('DONE'))
    .catch(console.error);
}