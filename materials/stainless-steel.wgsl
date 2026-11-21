// Neutral stainless steel conductor approximation. RGB-uniform F0 follows
// ((eta-1)^2+k^2)/((eta+1)^2+k^2), with eta=2.5, k=3.3: F0=0.568.
// Zero diffuse albedo; roughness is the GGX perceptual parameter, not a decal.
// All normals come from the swept tube geometry; no porcelain or normal overlay.
fn stainlessSteel(h:Hit)->Material {
 return Material(vec3f(0),.16,h.n,.568);
}
