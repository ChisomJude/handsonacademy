'use client';
import {useState} from 'react';
export function KnowledgeCheck({question,answer}:{question:string;answer:string}){const [show,setShow]=useState(false);return <div className="card" style={{padding:18}}><b>Knowledge check</b><p>{question}</p><button className="btn btn-secondary" onClick={()=>setShow(!show)}>{show?'Hide answer':'Show answer'}</button>{show&&<p style={{color:'var(--brand)',marginBottom:0}}><b>Answer:</b> {answer}</p>}</div>}
