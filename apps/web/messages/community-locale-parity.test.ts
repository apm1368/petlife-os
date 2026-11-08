import {describe,expect,it} from "vitest";
import en from "./en.json";
import fa from "./fa.json";
import de from "./de.json";
import es from "./es.json";

const flatten=(value:unknown,path=""):Array<[string,string]>=>{
 if(typeof value==="string")return [[path,value]];
 if(!value||typeof value!=="object")return [];
 return Object.entries(value).flatMap(([key,child])=>flatten(child,path?`${path}.${key}`:key));
};
const placeholders=(value:string)=>[...value.matchAll(/\{\s*([A-Za-z0-9_]+)\s*(?:,|\})/g)].map(match=>match[1]).sort();

describe("community message catalog parity",()=>{
 const baseline=flatten(en.community);
 it.each([["fa",fa.community],["de",de.community],["es",es.community]] as const)("keeps the %s community copy complete and interpolation-safe",(locale,messages)=>{
  const translated=flatten(messages),expectedKeys=baseline.map(([key])=>key).sort();
  expect(translated.map(([key])=>key).sort()).toEqual(expectedKeys);
  const byKey=new Map(translated);
  for(const [key,source] of baseline){
   expect(byKey.get(key),`${locale}.${key}`).toBeTruthy();
   expect(placeholders(byKey.get(key)!)).toEqual(placeholders(source));
  }
 });
});
