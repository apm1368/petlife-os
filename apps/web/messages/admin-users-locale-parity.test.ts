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

describe("admin user-directory locale parity",()=>{
 const baseline=flatten(en.adminUsers);
 it.each([["de",de.adminUsers],["es",es.adminUsers]] as const)("translates every user-directory key and preserves placeholders in %s",(locale,messages)=>{
  const translated=flatten(messages),expectedKeys=baseline.map(([key])=>key).sort();
  expect(translated.map(([key])=>key).sort()).toEqual(expectedKeys);
  const byKey=new Map(translated);
  for(const [key,source] of baseline){
   expect(byKey.get(key),`${locale}.${key}`).toBeTruthy();
   expect(placeholders(byKey.get(key)!)).toEqual(placeholders(source));
  }
 });
});
