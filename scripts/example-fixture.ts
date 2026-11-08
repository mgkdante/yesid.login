// Fake client, explicitly inserted after migrations by local fixtures.
export const exampleSiteSql = `INSERT OR IGNORE INTO site (slug,owner,repo,branch,label,installation_id)
VALUES ('example','example-owner','example-site','main','Example','123456');`;
