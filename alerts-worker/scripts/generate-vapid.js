import {generateKeyPairSync} from 'node:crypto';
const {privateKey} = generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const {x,y,d} = privateKey.export({format:'jwk'});
const publicKey = Buffer.concat([Buffer.from([4]),Buffer.from(x,'base64url'),Buffer.from(y,'base64url')]).toString('base64url');
console.log(`VAPID_SERVER_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_SERVER_PRIVATE_KEY=${d}`);
console.log('Keep the private key secret. Use the public key in the Worker and browser.');
