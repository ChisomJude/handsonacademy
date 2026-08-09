import type {MetadataRoute} from 'next';
const site='https://handsonacademy.org.ng';
const paths=['','/about','/tracks','/tracks/devops-beginner','/tracks/cloud-native-beginner','/community','/apply','/sponsor','/mentor','/privacy','/terms'];
export default function sitemap():MetadataRoute.Sitemap{return paths.map(path=>({url:`${site}${path}`,lastModified:new Date(),changeFrequency:path===''?'weekly':'monthly',priority:path===''?1:path.startsWith('/tracks')?.9:.6}))}
