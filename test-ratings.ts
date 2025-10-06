import * as cheerio from 'cheerio';
import browserClient from './src/proxy/browserClient';

async function testRatings() {
  try {
    console.log('Fetching Aventus page...');
    const html = await browserClient.getPageContent('https://www.parfumo.com/Perfumes/Creed/Aventus');

    const $ = cheerio.load(html);

    console.log('\n=== Searching for barfiller_element ===');
    const barfillers = $('.barfiller_element');
    console.log(`Found ${barfillers.length} .barfiller_element elements`);
    barfillers.each((i, elem) => {
      console.log(`  [${i}]: "${$(elem).text().trim()}"`);
    });

    console.log('\n=== Searching for ratingvalue ===');
    const ratingvalue = $('.ratingvalue');
    console.log(`Found ${ratingvalue.length} .ratingvalue elements`);
    ratingvalue.each((i, elem) => {
      console.log(`  [${i}]: "${$(elem).text().trim()}"`);
    });

    console.log('\n=== Searching for elements containing "Longevity" ===');
    const longevityElements = $('*:contains("Longevity")');
    console.log(`Found ${longevityElements.length} elements`);
    longevityElements.slice(0, 5).each((i, elem) => {
      const $elem = $(elem);
      console.log(`  [${i}] <${elem.tagName}> class="${$elem.attr('class')}": "${$elem.text().trim().substring(0, 100)}"`);
    });

    console.log('\n=== Searching for elements containing "Sillage" ===');
    const sillageElements = $('*:contains("Sillage")');
    console.log(`Found ${sillageElements.length} elements`);
    sillageElements.slice(0, 5).each((i, elem) => {
      const $elem = $(elem);
      console.log(`  [${i}] <${elem.tagName}> class="${$elem.attr('class')}": "${$elem.text().trim().substring(0, 100)}"`);
    });

    console.log('\n=== Searching for all elements with class containing "rating" ===');
    const ratingClasses = $('[class*="rating"]');
    console.log(`Found ${ratingClasses.length} elements with "rating" in class`);
    ratingClasses.slice(0, 10).each((i, elem) => {
      const $elem = $(elem);
      console.log(`  [${i}] <${elem.tagName}> class="${$elem.attr('class')}": "${$elem.text().trim().substring(0, 80)}"`);
    });

    await browserClient.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testRatings();
