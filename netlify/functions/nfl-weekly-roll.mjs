export const handler = async () => {
  try{
    const base = process.env.SITE_URL || process.env.URL || '';
    const url = `${base}/.netlify/functions/nfl-bootstrap?mode=auto&refresh=1`;
    await fetch(url);
    return { statusCode:200, body: JSON.stringify({ ok:true, ping:url }) };
  }catch(e){
    return { statusCode:500, body: JSON.stringify({ ok:false, error:String(e) }) };
  }
}