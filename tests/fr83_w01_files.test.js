// #FR-83 W01: первоисточники рациона — в реестре источников с путём и sha256; файл на диске (если он есть на этой машине) совпадает с записанной суммой
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
// sha256 первоисточников на 07.10.2026 (sha256sum)
const GOLDEN = {
  ROSSTAT_POTR2026: 'e2c4cae55214083f8824e0c25db876965bfcb30ca279724b72511e7d6af91ea6',
  ROSSTAT_PTR2025: 'ab1330a8c478e3344df3f852b2c04bd54ff4a45c225ea97d075960382d042d81',
  ROSSTAT_POTREB2023: '190804caf3d658658d4a73118ffbc159a5044e031c57b19b5e55cd3cdd06d838',
  MU_2153_06: '314b9f5cff91609992832b4e29d6849b561b7106f8835de20de99c5a031b85bc',
  PRIKAZ_MZ821_2022: '68013aa59409181c9838f5a4536d460b4c20bd3999c842452a89188c61fae2da',
  LEGALACTS_614: '47f6c7f45b3162548d431a75089c466df5a611dc4437c328028784bccffad8d9'
};
test('источники рациона: sha256 в реестре = эталон (файл на диске — при FR_CHECK_LOCAL=1)', async () => {
  const reg = JSON.parse(await readFile(new URL('public/data/sources.json', root), 'utf8')).sources;
  for (const [code, sha] of Object.entries(GOLDEN)) {
    assert.equal(reg[code]?.sha256, sha, code);
    assert.ok(reg[code].local && reg[code].evidence.some(e => e.includes(sha)), `${code}: нет пути или sha256 в evidence`);
    // файлы вне репозитория проверяются только по явной просьбе (FR_CHECK_LOCAL=1): тест не зависит от локальных файлов
    if (process.env.FR_CHECK_LOCAL === '1' && existsSync(reg[code].local)) assert.equal(createHash('sha256').update(await readFile(reg[code].local)).digest('hex'), sha, `${code}: файл изменён`);
  }
});
