import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { detectPlatform, scrapeListing } from './scrapers/index.js';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function processarLinksPendentes() {
  const { data: pendentes, error: fetchError } = await supabase
    .from('accommodations')
    .select('*')
    .is('title', null)
    .limit(1);

  if (fetchError || !pendentes || pendentes.length === 0) {
    return false;
  }

  const hospedagem = pendentes[0];
  const platform = detectPlatform(hospedagem.url);
  console.log(`\n🌐 Novo link encontrado (${platform})! Acessando: ${hospedagem.url}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'pt-BR',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto(hospedagem.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);

    console.log('🕵️ Extraindo dados com parser específico da plataforma...');
    const scraped = await scrapeListing(page, hospedagem.url);

    console.log('📋 Resultado:', {
      title: scraped.title,
      price: scraped.price,
      bedrooms: scraped.bedrooms,
      beds: scraped.beds,
      bathrooms: scraped.bathrooms,
      wifi: scraped.wifi,
      tv: scraped.tv,
      air_conditioning: scraped.air_conditioning,
      kitchen: scraped.kitchen,
      petfriendly: scraped.petfriendly,
      parking: scraped.parking,
    });

    console.log('💾 Salvando no Supabase...');
    await supabase
      .from('accommodations')
      .update({
        title: scraped.title,
        price: scraped.price,
        bedrooms: scraped.bedrooms,
        beds: scraped.beds,
        bathrooms: scraped.bathrooms,
        wifi: scraped.wifi,
        tv: scraped.tv,
        air_conditioning: scraped.air_conditioning,
        kitchen: scraped.kitchen,
        petfriendly: scraped.petfriendly,
        parking: scraped.parking,
      })
      .eq('id', hospedagem.id)
      .is('title', null);

    console.log('🎉 Finalizado com sucesso!');
    return true;
  } catch (erro) {
    console.error('❌ Erro durante a raspagem:', erro);
    await supabase.from('accommodations').update({ title: 'Erro ao ler link' }).eq('id', hospedagem.id);
    return true;
  } finally {
    await browser.close();
  }
}

async function iniciarMotor() {
  console.log('🤖 Robô ligado pelo GitHub Actions! Verificando fila...');

  let temTrabalho = true;

  while (temTrabalho) {
    temTrabalho = await processarLinksPendentes();
    if (temTrabalho) {
      await sleep(2000);
    }
  }

  console.log('🏁 Todos os links pendentes foram processados. Desligando...');
  process.exit(0);
}

iniciarMotor();
