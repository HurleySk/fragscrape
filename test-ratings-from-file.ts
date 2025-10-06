import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';

async function testRatingsFromFile() {
  try {
    console.log('Reading example.txt file...');
    const filePath = path.join(process.env.HOME || '', 'Downloads', 'example.txt');
    const html = fs.readFileSync(filePath, 'utf-8');

    const $ = cheerio.load(html);

    console.log('\n=== Testing Rating Extraction ===');

    // Extract total ratings count
    const ratingCountText = $('[itemprop="ratingCount"]').text().trim();
    console.log(`\nTotal Ratings Text: "${ratingCountText}"`);
    const countMatch = ratingCountText.match(/(\d+)\s*Ratings?/i);
    const totalRatings = countMatch ? parseInt(countMatch[1]) : undefined;
    console.log(`Total Ratings: ${totalRatings}`);

    // Extract each rating dimension
    const ratings: any = {};

    $('.barfiller_element').each((_, elem) => {
      const $elem = $(elem);
      const dataType = $elem.attr('data-type');

      if (!dataType) return;

      const $ratingSpan = $elem.find('span.bold, .pr-0-5.bold, .text-lg.bold').first();
      const ratingText = $ratingSpan.text().trim();
      const ratingMatch = ratingText.match(/(\d+\.?\d*)/);

      if (ratingMatch) {
        const ratingValue = parseFloat(ratingMatch[1]);
        ratings[dataType] = ratingValue;
        console.log(`\n${dataType}: ${ratingValue}`);
      }
    });

    console.log('\n=== Final Ratings Object ===');
    console.log({
      scent: ratings.scent,
      longevity: ratings.durability,
      sillage: ratings.sillage,
      bottle: ratings.bottle,
      priceValue: ratings.pricing,
      totalRatings: totalRatings
    });

    console.log('\n✓ Rating extraction test completed!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testRatingsFromFile();
