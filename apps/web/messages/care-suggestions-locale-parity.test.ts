import {describe,expect,it} from "vitest";
import en from "./en.json";
import de from "./de.json";
import es from "./es.json";

const flatten=(value:unknown,path=""):Array<[string,string]>=>{
 if(typeof value==="string")return [[path,value]];
 if(!value||typeof value!=="object")return [];
 return Object.entries(value).flatMap(([key,child])=>flatten(child,path?`${path}.${key}`:key));
};
const placeholders=(value:string)=>[...value.matchAll(/\{([^{}]+)\}/g)].map(match=>match[1]).sort();

describe("care suggestion German and Spanish message parity",()=>{
 const baseline=flatten(en.careSuggestions);
 it.each([["de",de.careSuggestions],["es",es.careSuggestions]] as const)("keeps the %s catalog complete and interpolation-safe",(locale,messages)=>{
  const translated=flatten(messages);
  expect(translated.map(([key])=>key).sort()).toEqual(baseline.map(([key])=>key).sort());
  const byKey=new Map(translated);
  for(const [key,source] of baseline){
   expect(byKey.get(key),`${locale}.${key}`).toBeTruthy();
   expect(placeholders(byKey.get(key)!)).toEqual(placeholders(source));
  }
 });
});
