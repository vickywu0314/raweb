// Native DB owner必须在任何fixture建表前核实服务器，不能用8.x/H2报告5.7通过。
export function requireMysql57(version, packet) {
  if (typeof version !== 'string' || !/^5\.7\.44(?:[-.][A-Za-z0-9_.-]+)?$/.test(version) || /mariadb/i.test(version)) throw new Error('mysql-5.7.44-required');
  if (!Number.isSafeInteger(Number(packet)) || Number(packet) < 64*1024*1024) throw new Error('mysql-64m-packet-required');
}
