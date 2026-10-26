import { HttpError } from '../middleware/errors.js';
import { date, fail, id } from './validation.js';
import { companyProfileKeys, emptyCompanyProfile } from '../../../shared/company-profile.js';
import { validateCompanyProfile } from './company-profile.js';
import { withTransaction } from '../db/transaction.js';
import { companyFormats } from '../../../shared/company-formats.js';

const maxLogoBytes = 2 * 1024 * 1024;
const companyColumns = 'c.id, c.name, c.subaccount_length, c.business_format, l.updated_at AS logo_version';
const companyFrom = `FROM companies c LEFT JOIN company_logos l ON l.company_id = c.id
  LEFT JOIN company_details d ON d.company_id = c.id`;
const companyQuery = 'SELECT ' + companyColumns + ', ' + companyProfileKeys.map(field => 'd.' + field).join(', ') + ' ' + companyFrom;
const companyListQuery = 'SELECT ' + companyColumns + ', d.tax_id, d.city ' + companyFrom;

function companyDetails(row, full = false) {
  return {
    id: row.id, name: row.name, subaccount_length: row.subaccount_length, business_format: row.business_format||'general',
    ...(full ? Object.fromEntries(companyProfileKeys.map(field => [field, row[field] ?? ''])) : { tax_id: row.tax_id ?? '', city: row.city ?? '' }),
    logo_url: row.logo_version ? `/api/companies/${row.id}/logo?v=${encodeURIComponent(String(row.logo_version))}` : null,
  };
}

function name(value, limit, code) {
  if (typeof value !== 'string' || !value.trim() || [...value.trim()].length > limit) fail(code);
  return value.trim();
}
function businessFormat(value){if(!companyFormats.includes(value))fail('INVALID_COMPANY_FORMAT');return value;}

export function validateLogo(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') fail('INVALID_COMPANY_LOGO');
  if (value.length > Math.ceil(maxLogoBytes / 3) * 4 + 64) throw new HttpError(413, 'LOGO_TOO_LARGE');
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) fail('INVALID_COMPANY_LOGO');
  const content = Buffer.from(match[2], 'base64');
  if (content.length > maxLogoBytes) throw new HttpError(413, 'LOGO_TOO_LARGE');
  if (content.toString('base64') !== match[2]) fail('INVALID_COMPANY_LOGO');
  const valid = match[1] === 'image/png'
    ? content.length >= 45 && content.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      && content.toString('ascii', 12, 16) === 'IHDR'
      && content.subarray(-8).equals(Buffer.from('49454e44ae426082', 'hex'))
    : match[1] === 'image/jpeg'
      ? content.length >= 4 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff
        && content[content.length - 2] === 0xff && content[content.length - 1] === 0xd9
      : content.length >= 20 && content.toString('ascii', 0, 4) === 'RIFF'
        && content.toString('ascii', 8, 12) === 'WEBP' && content.readUInt32LE(4) + 8 === content.length;
  if (!valid) fail('INVALID_COMPANY_LOGO');
  return { mimeType: match[1], content };
}

export function createCompanyService(pool) {
  async function getCompany(companyId, db = pool) {
    const [[row]] = await db.execute(companyQuery + ' WHERE c.id = ?', [id(companyId)]);
    if (!row) throw new HttpError(404, 'COMPANY_NOT_FOUND');
    return companyDetails(row, true);
  }

  const transaction = action => withTransaction(pool, action);

  async function saveLogo(db, companyId, logo) {
    if (!logo) {
      await db.execute('DELETE FROM company_logos WHERE company_id = ?', [companyId]);
      return;
    }
    await db.execute(`INSERT INTO company_logos (company_id, mime_type, content) VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), content = VALUES(content), updated_at = CURRENT_TIMESTAMP(6)`,
    [companyId, logo.mimeType, logo.content]);
  }

  async function saveProfile(db, companyId, profile) {
    const columns = ['company_id', ...companyProfileKeys];
    const assignments = companyProfileKeys.map(field => field + ' = VALUES(' + field + ')').join(', ');
    await db.execute('INSERT INTO company_details (' + columns.join(', ') + ') VALUES (' + columns.map(() => '?').join(', ') + ') ON DUPLICATE KEY UPDATE ' + assignments,
      [companyId, ...companyProfileKeys.map(field => profile[field])]);
  }

  return {
    getCompany,
    async listCompanies() {
      const [rows] = await pool.execute(companyListQuery + ' ORDER BY c.name, c.id');
      return rows.map(row => companyDetails(row));
    },
    async createCompany(body) {
      if (!body || Object.keys(body).some(key => !['name', 'exercise', 'logo', 'business_format', ...companyProfileKeys].includes(key))) fail('INVALID_COMPANY');
      const companyName = name(body.name, 160, 'INVALID_COMPANY_NAME');
      const format=businessFormat(body.business_format===undefined?'general':body.business_format);
      const profile = { ...emptyCompanyProfile(), ...validateCompanyProfile(body) };
      const exercise = body.exercise;
      if (!exercise || typeof exercise !== 'object') fail('INVALID_EXERCISE');
      const exerciseName = name(exercise.name, 60, 'INVALID_EXERCISE');
      const start = date(exercise.start_date), end = date(exercise.end_date);
      if (start > end) fail('INVALID_EXERCISE_PERIOD');
      const logo = validateLogo(body.logo);
      return transaction(async db => {
        const [company] = await db.execute('INSERT INTO companies (name,business_format) VALUES (?,?)', [companyName,format]);
        await db.execute(`INSERT INTO accounting_exercises (company_id, name, start_date, end_date, status, is_default)
          VALUES (?, ?, ?, ?, 'open', 1)`, [company.insertId, exerciseName, start, end]);
        await saveProfile(db, company.insertId, profile);
        if (logo) await saveLogo(db, company.insertId, logo);
        return getCompany(company.insertId, db);
      });
    },
    async updateCompany(companyId, body) {
      const targetId = id(companyId);
      if (!body || Object.keys(body).some(key => !['name', 'logo', 'business_format', ...companyProfileKeys].includes(key))) fail('INVALID_COMPANY');
      const companyName = name(body.name, 160, 'INVALID_COMPANY_NAME');
      const format=Object.hasOwn(body,'business_format')?businessFormat(body.business_format):undefined;
      const profile = validateCompanyProfile(body);
      const logo = validateLogo(body.logo);
      return transaction(async db => {
        const [[company]] = await db.execute('SELECT id FROM companies WHERE id = ? FOR UPDATE', [targetId]);
        if (!company) throw new HttpError(404, 'COMPANY_NOT_FOUND');
        if (Object.keys(profile).length) {
          const current = await getCompany(targetId, db);
          if(Object.hasOwn(profile,'tax_id')&&profile.tax_id!==current.tax_id){
            const [[fiscal]]=await db.execute('SELECT id FROM verifactu_records WHERE company_id=? LIMIT 1',[targetId]);
            if(fiscal)fail('VERIFACTU_ISSUER_CHANGED');
          }
          await saveProfile(db, targetId, { ...current, ...profile });
        }
        await db.execute('UPDATE companies SET name = ? WHERE id = ?', [companyName, targetId]);
        if(format!==undefined)await db.execute('UPDATE companies SET business_format=? WHERE id=?',[format,targetId]);
        if (Object.hasOwn(body, 'logo')) await saveLogo(db, targetId, logo);
        const updated=await getCompany(targetId, db),producerNif=String(updated.tax_id||'').replace(/\s/g,'').toUpperCase();
        // Once records exist, retain the producer identity used by that chain.
        if(updated.name.length<=120&&producerNif.length<=9)await db.execute("UPDATE verifactu_settings s SET producer_name=?,producer_nif=?,issuer_nif=? WHERE s.company_id=? AND s.producer_source='company' AND NOT EXISTS(SELECT 1 FROM verifactu_records r WHERE r.company_id=s.company_id)",[updated.name,producerNif,producerNif,targetId]);
        return updated;
      });
    },
    async getCompanyLogo(companyId) {
      const [[logo]] = await pool.execute('SELECT mime_type, content FROM company_logos WHERE company_id = ?', [id(companyId)]);
      if (!logo) throw new HttpError(404, 'LOGO_NOT_FOUND');
      return logo;
    },
  };
}
