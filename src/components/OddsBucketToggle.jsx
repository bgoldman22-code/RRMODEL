import React from 'react';

export default function OddsBucketToggle({ value, onChange }){
  const opts = [
    {key:'all', label:'All'},
    {key:'short', label:'Short (+150–+250)'},
    {key:'mid', label:'Mid (+251–+400)'},
    {key:'long', label:'Long (+401+)'}
  ];
  return (
    <div className="flex flex-wrap gap-2 items-center text-sm">
      <span className="opacity-70">Odds bucket:</span>
      {opts.map(o => (
        <button
          key={o.key}
          onClick={()=>onChange(o.key)}
          className={`px-2 py-1 rounded border ${value===o.key?'bg-black text-white':'bg-white'} hover:opacity-80`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
