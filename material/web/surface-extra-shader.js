import {FORM_SURFACE_GLSL} from './form-effects.js';
import {BURL_SURFACE_GLSL} from './burl-scatter-shader.js';
// Procedural surface estimates. Physical height is independent of bark strength.
export const EXTRA_SURFACE_GLSL=`
${FORM_SURFACE_GLSL}
${BURL_SURFACE_GLSL}
Surface extraSurface(int type,Surface s,vec3 p,vec3 n,float seed){
 if(type==15)return burlSurface(s,p,n,seed);
 if(type>=11)return formSurface(type,s,p,n,seed);
 float amount=effectParameter(0,1.),rough=effectParameter(1,.9),normal=effectParameter(2,1.),height=effectParameter(3,0.),grain=max(effectParameter(4,.01),.0005),variation=effectParameter(5,.4),ao=effectParameter(6,.35),keep=effectParameter(7,1.);
 vec3 tint=effectColor(vec3(.5)),phase=vec3(seed*.37+9.,seed*.17+21.,seed*.53+4.);
 float fine=organicNoise(p,grain,phase),broad=organicNoise(p,grain*4.,phase+13.);float relief=fine;
 s.layerCoverage=amount;
 if(type==8){s.color*=mix(vec3(1),tint*(.8+variation*broad*.4),amount);s.rough=mix(s.rough,rough,amount);return s;}
 if(type==9){float lum=dot(s.color,vec3(.2126,.7152,.0722));vec3 faded=mix(s.color,vec3(lum),effectParameter(8,.4))*1.12+tint*.09;s.color=mix(s.color,faded,amount);s.rough=mix(s.rough,rough,amount);return s;}
 if(type==6){relief=fine*.25+broad*.75;}
 if(type==10){float plates=smoothstep(.3,.7,broad),ridges=1.-abs(fine*2.-1.);relief=plates*.75+ridges*.25;}
 vec3 pigment=tint*(.86+(fine-.5)*variation*.38+(broad-.5)*variation*.22);
 s.color=mix(s.color,pigment,amount);s.rough=mix(s.rough,clamp(rough+(fine-.5)*variation*.08,.05,1.),amount);
 float retained=mix(1.,keep,amount);s.h*=retained;s.normalWeight*=retained;s.detailGradient*=retained;s.coatH=s.coatH*retained+amount*normal*height*(.15+relief*.85)/uTreeHeight;
 if(uPass==-1||uPass==2||uPass==5||uPass==10)s.localAO*=1.-amount*ao*(1.-relief)*.35;
 return s;
}
`;
