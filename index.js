const fs = require('fs');
const util = require('util');
const {get} = require('simple-get-promise');
const cached = require('@piuccio/cached-function');
const convert = require('html-to-json-data');
const {group, text, href, attr} = require('html-to-json-data/definitions');
const writeFile = util.promisify(fs.writeFile);

const WARDS = {
  kawasaki: 'http://www.city.kawasaki.jp/kurashi/category/17-2-10-1-1-0-0-0-0-0.html',
  saiwai: 'http://www.city.kawasaki.jp/kurashi/category/17-2-10-1-2-0-0-0-0-0.html',
  nakahara: 'http://www.city.kawasaki.jp/kurashi/category/17-2-10-1-3-0-0-0-0-0.html',
  takatsu: 'http://www.city.kawasaki.jp/kurashi/category/17-2-10-1-4-0-0-0-0-0.html',
  miyamae: 'http://www.city.kawasaki.jp/kurashi/category/17-2-10-1-5-0-0-0-0-0.html',
  tama: 'http://www.city.kawasaki.jp/kurashi/category/17-2-10-1-6-0-0-0-0-0.html',
  aso: 'http://www.city.kawasaki.jp/kurashi/category/17-2-10-1-7-0-0-0-0-0.html',
};

async function start() {
  const list = [];
  for (const [wardName, pageUrl] of Object.entries(WARDS)) {
    list.push(...await getListByWard(pageUrl, wardName));
  }
  await writeFile('output/all.json', JSON.stringify(list.map(getProperties), null, 2));
  await writeFile('output/all.geojson', await geojson(list));
}

async function getListByWard(pageUrl, wardName) {
  const list = await getWardPageDetails(pageUrl);
  for (const item of list) {
    const details = await getNurseryPageDetails(item.link);
    Object.assign(item, details);
  }
  await writeFile(`output/${wardName}.json`, JSON.stringify(list.map(getProperties), null, 2));
  await writeFile(`output/${wardName}.geojson`, await geojson(list));
  return list;
}

const fetch = cached('tmp/pages.json', async (pageUrl) => {
  const {responseText: content} = await get(pageUrl);
  return content;
});

async function getWardPageDetails(pageUrl) {
  const content = await fetch(pageUrl);
  const list = convert(content, group('.catlst li', {
    name: text('a'),
    link: href('a', pageUrl),
    address: text('p'),
  }));
  list.forEach((item) => {
    const [,codeBefore, codeAfter, address] =
      item.address.match(/^〒?\s?(\d{3})[-－ー](\d{4})\s+(.*)/) ||
      console.error(`Missing address in ${pageUrl}`, item.address) ||
      ['','','',item.address];
    item.address = address;
    item.postcode = `${codeBefore}-${codeAfter}`;
  });
  return list;
}

const PHONE_NUMBER_LABEL = /(?:電話(?:.FAX)?|TEL)[：:\s]*(\d{3})[-－‐（）()](\d{3})[-－‐（）()](\d{4})/;
const PHONE_NUMBER_NO_LABEL = /^(\d{3})[-－‐（）](\d{3})[-－‐（）](\d{4})/;
const PHONE_NUMBER_WITHOUT_AREA = /電話[：:\s]*(\d{3})[-－‐（）()](\d{4})/;

async function getNurseryPageDetails(pageUrl) {
  const content = await fetch(pageUrl);
  const details = convert(content, {
    geometry: attr('.mol_gmapblock iframe', 'src'),
    phone: group('.mol_textblock', text('p'))
      .filterBy(text(':self'), (text) => text.match
        ? text.match(PHONE_NUMBER_LABEL)
        || text.match(PHONE_NUMBER_NO_LABEL)
        || text.match(PHONE_NUMBER_WITHOUT_AREA)
        : false)
      .flat(),
  });

  let lat,lon;
  if (details.geometry) {
    const match = details.geometry.match(/q=loc:([\d.]+),([\d.]+)/)
      || details.geometry.match(/\?ll=([\d.]+),([\d.]+)/)
      || console.log(`Missing location in ${pageUrl}`, details.geometry);
    lat = match[1];
    lon = match[2];
  } else {
    console.log(`Missing location in ${pageUrl}`);
  }

  if (details.phone.length === 0) console.log(`Missing phone number in ${pageUrl}`);
  const [,area,prefix,number] = details.phone[0].match(PHONE_NUMBER_LABEL)
    || details.phone[0].match(PHONE_NUMBER_NO_LABEL)
    || details.phone[0].match(PHONE_NUMBER_WITHOUT_AREA);
  return {
    latitude: Number(lat),
    longitude: Number(lon),
    phone: number ? `${area}-${prefix}-${number}` : `044-${area}-${prefix}`,
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