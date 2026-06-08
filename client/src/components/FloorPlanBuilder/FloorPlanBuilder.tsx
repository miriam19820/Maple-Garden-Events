import React, { useState, useEffect } from 'react';
import Draggable from 'react-draggable';
import './FloorPlanBuilder.css';

export interface TableData {
  id: number;
  x: number;
  y: number;
}

interface Props {
  tableCount: number;
  menPercent: number;
  womenPercent: number;
  initialTables?: TableData[]; // לקבלת נתונים קיימים מהשרת
  onSave: (tables: TableData[]) => void;
}

export const FloorPlanBuilder: React.FC<Props> = ({ tableCount, menPercent, womenPercent, initialTables, onSave }) => {
  const [tables, setTables] = useState<TableData[]>([]);

  useEffect(() => {
    if (initialTables && initialTables.length > 0) {
      setTables(initialTables);
    } else {
      const generated = Array.from({ length: tableCount }).map((_, i) => ({ id: i + 1, x: 20 + (i%5)*60, y: 20 + Math.floor(i/5)*60 }));
      setTables(generated);
    }
  }, [tableCount, initialTables]);

  return (
    <div className="floor-plan-container">
      <div className="hall" style={{ position: 'relative', width: '100%', height: '500px', border: '1px solid #000' }}>
        {tables.map((t) => (
          <Draggable key={t.id} defaultPosition={{ x: t.x, y: t.y }} onStop={(e, data) => {
            setTables(prev => prev.map(item => item.id === t.id ? {...item, x: data.x, y: data.y} : item));
          }} bounds="parent">
            <div className="table-box" style={{ width: '40px', height: '40px', background: 'blue', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab' }}>
              {t.id}
            </div>
          </Draggable>
        ))}
      </div>
      <button onClick={() => onSave(tables)}>שמור סידור</button>
    </div>
  );
};