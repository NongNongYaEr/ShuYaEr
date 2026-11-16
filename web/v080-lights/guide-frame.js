export function createGuideFrame(THREE,axis,guide){
  let previousTangent=null,previousStation=0,frameX=null;

  return station=>{
    const origin=axis.at(station),progress=axis.length?station/axis.length:0;
    const radius=guide.start_radius+(guide.end_radius-guide.start_radius)*progress;
    const halfWindow=Math.min(axis.length*.25,Math.max(.025,radius*2));
    const tangent=axis.at(station+halfWindow).sub(axis.at(station-halfWindow));
    if(tangent.lengthSq()<1e-12)tangent.copy(previousTangent||new THREE.Vector3(0,0,1));
    tangent.normalize();

    if(frameX){
      const turn=new THREE.Quaternion().setFromUnitVectors(previousTangent,tangent);
      const angle=previousTangent.angleTo(tangent);
      // Keep the rotation of the cross section slower than the advance of
      // its inside edge, where a sharp guide corner can fold adjacent turns.
      const maximumTurn=Math.max(0,station-previousStation)*.65/Math.max(radius,.001);
      if(angle>maximumTurn){
        turn.rotateTowards(new THREE.Quaternion(),angle-maximumTurn);
        tangent.copy(previousTangent).applyQuaternion(turn);
      }
      frameX.applyQuaternion(turn).addScaledVector(tangent,-frameX.dot(tangent)).normalize();
    }else{
      frameX=Math.abs(tangent.z)>.85?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1);
      frameX.addScaledVector(tangent,-frameX.dot(tangent)).normalize();
    }
    previousTangent=tangent;
    previousStation=station;
    const frameY=new THREE.Vector3().crossVectors(tangent,frameX),x=frameX.clone();
    const radialAt=angle=>x.clone().multiplyScalar(Math.cos(angle)).addScaledVector(frameY,Math.sin(angle));
    return {origin,tangent,radialAt};
  };
}
