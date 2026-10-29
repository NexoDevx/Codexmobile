// java test/VerifyV2.java app.apk — verificador independente (JDK puro) do APK Signature Scheme v2
import java.nio.*;import java.nio.file.*;import java.security.*;import java.security.spec.*;import java.security.cert.*;import java.io.*;import java.util.*;
public class VerifyV2{
 static ByteBuffer le(byte[] b,int o,int l){return ByteBuffer.wrap(b,o,l).order(ByteOrder.LITTLE_ENDIAN);}
 static byte[] sha(byte[]... p)throws Exception{MessageDigest m=MessageDigest.getInstance("SHA-256");for(byte[] x:p)m.update(x);return m.digest();}
 static byte[] lp(ByteBuffer b){int n=b.getInt();byte[] r=new byte[n];b.get(r);return r;}
 public static void main(String[] a)throws Exception{byte[] z=Files.readAllBytes(Path.of(a[0]));int e=-1;for(int i=z.length-22;i>=0;i--)if(le(z,i,4).getInt()==0x06054b50){e=i;break;}
  int cdOff=le(z,e+16,4).getInt();
  // bloco termina em cdOff: [size8][pairs][size8][magic16]
  String magic=new String(z,cdOff-16,16);if(!magic.equals("APK Sig Block 42")){System.out.println("FALHA: sem magic");System.exit(1);}
  long size=le(z,cdOff-24,8).getLong();int blkStart=(int)(cdOff-size-8);if(le(z,blkStart,8).getLong()!=size){System.out.println("FALHA: tamanhos do bloco diferem");System.exit(1);}
  int p=blkStart+8,end=cdOff-24;byte[] v2=null;while(p<end){long l=le(z,p,8).getLong();int id=le(z,p+8,4).getInt();if(id==0x7109871a){v2=Arrays.copyOfRange(z,p+12,(int)(p+8+l));}p+=8+l;}
  if(v2==null){System.out.println("FALHA: sem bloco v2");System.exit(1);}
  ByteBuffer s=ByteBuffer.wrap(v2).order(ByteOrder.LITTLE_ENDIAN);ByteBuffer signers=ByteBuffer.wrap(lp(s)).order(ByteOrder.LITTLE_ENDIAN);
  while(signers.hasRemaining()){ByteBuffer sg=ByteBuffer.wrap(lp(signers)).order(ByteOrder.LITTLE_ENDIAN);byte[] signed=lp(sg);ByteBuffer sigs=ByteBuffer.wrap(lp(sg)).order(ByteOrder.LITTLE_ENDIAN);byte[] pub=lp(sg);
   ByteBuffer one=ByteBuffer.wrap(lp(sigs)).order(ByteOrder.LITTLE_ENDIAN);int alg=one.getInt();byte[] sig=lp(one);if(alg!=0x103){System.out.println("FALHA: algoritmo "+alg);System.exit(1);}
   Signature v=Signature.getInstance("SHA256withRSA");v.initVerify(KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(pub)));v.update(signed);if(!v.verify(sig)){System.out.println("FALHA: assinatura inválida");System.exit(1);}
   ByteBuffer sd=ByteBuffer.wrap(signed).order(ByteOrder.LITTLE_ENDIAN);ByteBuffer digs=ByteBuffer.wrap(lp(sd)).order(ByteOrder.LITTLE_ENDIAN);ByteBuffer certs=ByteBuffer.wrap(lp(sd)).order(ByteOrder.LITTLE_ENDIAN);
   ByteBuffer d1=ByteBuffer.wrap(lp(digs)).order(ByteOrder.LITTLE_ENDIAN);d1.getInt();byte[] want=lp(d1);
   X509Certificate c=(X509Certificate)CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(lp(certs)));c.checkValidity();
   if(!Arrays.equals(c.getPublicKey().getEncoded(),pub)){System.out.println("FALHA: chave do certificado difere");System.exit(1);}
   c.verify(c.getPublicKey());
   // digest do conteúdo
   byte[][] secs={Arrays.copyOfRange(z,0,blkStart),Arrays.copyOfRange(z,cdOff,e),Arrays.copyOfRange(z,e,z.length)};
   // EOCD: offset do CD aponta para o início do bloco
   ByteBuffer.wrap(secs[2]).order(ByteOrder.LITTLE_ENDIAN).putInt(16,blkStart);
   List<byte[]> ds=new ArrayList<>();for(byte[] sec:secs)for(int o=0;o<sec.length;o+=1<<20){int n=Math.min(1<<20,sec.length-o);ByteBuffer h=ByteBuffer.allocate(5).order(ByteOrder.LITTLE_ENDIAN);h.put((byte)0xa5).putInt(n);ds.add(sha(h.array(),Arrays.copyOfRange(sec,o,o+n)));}
   ByteBuffer h=ByteBuffer.allocate(5).order(ByteOrder.LITTLE_ENDIAN);h.put((byte)0x5a).putInt(ds.size());MessageDigest m=MessageDigest.getInstance("SHA-256");m.update(h.array());for(byte[] x:ds)m.update(x);
   if(!Arrays.equals(m.digest(),want)){System.out.println("FALHA: digest do conteúdo não confere");System.exit(1);}
   System.out.println("v2 OK: assinatura RSA válida, certificado autoassinado "+c.getSubjectX500Principal()+", digest confere ("+ds.size()+" blocos)");}
 }}
