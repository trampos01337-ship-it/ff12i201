const cache = new Map();
const TTL = 5 * 60 * 1000;

module.exports = async (req, res) => {
  const username = String(req.query.username || '').trim();

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: 'Nome de usuário inválido.' });
  }

  const key = username.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < TTL) {
    return res.status(200).json(hit.data);
  }

  try {
    const r1 = await fetch('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
    });
    const d1 = await r1.json();
    const user = d1.data?.[0];

    if (!user || user.requestedUsername.toLowerCase() !== user.name.toLowerCase()) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const [profileRes, thumbRes] = await Promise.all([
      fetch(`https://users.roblox.com/v1/users/${user.id}`),
      fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=420x420&format=Png`),
    ]);

    const profile = await profileRes.json();
    const thumb = await thumbRes.json();

    const data = {
      id: profile.id,
      username: profile.name,
      displayName: profile.displayName,
      description: profile.description,
      created: profile.created,
      isBanned: profile.isBanned,
      avatar: thumb.data?.[0]?.imageUrl,
      profileUrl: `https://www.roblox.com/users/${profile.id}/profile`,
    };

    cache.set(key, { time: Date.now(), data });
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ error: 'Erro ao consultar o Roblox.' });
  }
};
